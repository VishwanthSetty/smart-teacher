import { InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3ServiceException } from '@aws-sdk/client-s3';
import { S3StorageService } from './s3-storage.service';

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://storage.test/signed'),
}));

const CONFIG: Record<string, unknown> = {
  S3_ENDPOINT: 'http://minio:9000',
  S3_PUBLIC_ENDPOINT: 'http://localhost:9000',
  S3_REGION: 'us-east-1',
  S3_ACCESS_KEY_ID: 'key',
  S3_SECRET_ACCESS_KEY: 'secret',
  S3_INGEST_BUCKET: 'ingest-bucket',
  S3_FORCE_PATH_STYLE: true,
  S3_UPLOAD_URL_EXPIRY_SECS: 900,
  S3_DOWNLOAD_URL_EXPIRY_SECS: 300,
};

function notFound(): S3ServiceException {
  return new S3ServiceException({
    name: 'NotFound',
    $fault: 'client',
    $metadata: { httpStatusCode: 404 },
  });
}

describe('S3StorageService', () => {
  let service: S3StorageService;
  let send: jest.Mock;

  beforeEach(() => {
    const configService = {
      getOrThrow: jest.fn((key: string) => CONFIG[key]),
    } as unknown as ConfigService;

    service = new S3StorageService(configService);
    send = jest.fn();
    // Both clients are private implementation detail; the spec drives them through the
    // port, so it only needs their transport stubbed.
    (service as unknown as { client: { send: jest.Mock } }).client = { send };
  });

  it('reports a missing object as null rather than throwing — an abandoned upload is expected', async () => {
    send.mockRejectedValue(notFound());

    await expect(service.statObject('video-1/source.mp4')).resolves.toBeNull();
  });

  it('returns the stored size and type when the object exists', async () => {
    send.mockResolvedValue({ ContentLength: 4096, ContentType: 'video/mp4' });

    await expect(service.statObject('video-1/source.mp4')).resolves.toEqual({
      sizeBytes: 4096,
      contentType: 'video/mp4',
    });
  });

  it('treats a zero-byte object as present, not missing', async () => {
    send.mockResolvedValue({ ContentLength: 0, ContentType: 'video/mp4' });

    await expect(service.statObject('video-1/source.mp4')).resolves.toEqual({
      sizeBytes: 0,
      contentType: 'video/mp4',
    });
  });

  // A vendor stack trace reaching the global filter would be logged as an unhandled 500
  // and could leak provider detail into the response.
  it('translates a real SDK failure into an HTTP exception instead of leaking it', async () => {
    send.mockRejectedValue(
      new S3ServiceException({
        name: 'InternalError',
        $fault: 'server',
        $metadata: { httpStatusCode: 500 },
      }),
    );

    await expect(service.statObject('video-1/source.mp4')).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });

  it('signs the upload URL against the browser-facing endpoint, not the internal one', async () => {
    const { getSignedUrl } = jest.requireMock('@aws-sdk/s3-request-presigner');

    const upload = await service.createPresignedUpload('video-1/source.mp4', 'video/mp4');

    expect(upload).toEqual({
      url: 'https://storage.test/signed',
      key: 'video-1/source.mp4',
      expiresInSecs: 900,
    });
    const [signingClient] = getSignedUrl.mock.calls[0];
    await expect(signingClient.config.endpoint()).resolves.toEqual(
      expect.objectContaining({ hostname: 'localhost' }),
    );
  });

  it('reads a bounded manifest and reports a missing one as null', async () => {
    async function* body() { yield Buffer.from('#EXTM3U\n'); }
    send.mockResolvedValueOnce({ ContentLength: 8, Body: body() });
    await expect(service.getObjectText('videos/1/master.m3u8')).resolves.toBe('#EXTM3U\n');
    send.mockRejectedValueOnce(notFound());
    await expect(service.getObjectText('missing.m3u8')).resolves.toBeNull();
  });

  it('refuses an oversized manifest before buffering it', async () => {
    send.mockResolvedValue({ ContentLength: 1024 * 1024 + 1, Body: {} });
    await expect(service.getObjectText('videos/1/master.m3u8')).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });

  it('deletes every listed object under a slash-terminated prefix', async () => {
    send
      .mockResolvedValueOnce({ Contents: [{ Key: 'videos/1/a' }], IsTruncated: true, NextContinuationToken: 'next' })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ Contents: [{ Key: 'videos/1/b' }], IsTruncated: false })
      .mockResolvedValueOnce({});
    await service.deletePrefix('videos/1/');
    expect(send).toHaveBeenCalledTimes(4);
    await expect(service.deletePrefix('videos/1')).rejects.toBeInstanceOf(InternalServerErrorException);
  });
});
