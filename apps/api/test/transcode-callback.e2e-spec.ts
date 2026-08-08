import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient, Role, VideoStatus } from '@prisma/client';
import request from 'supertest';
import { createE2eApp } from './utils/e2e-app';
import { loginAllRoles } from './utils/login';
import { seedContentFixtures } from './utils/content-fixtures';
import { PresignedDownload, StorageService, StoredObject } from '../src/storage/storage.service';
import { TranscodeQueue } from '../src/transcoding/transcode-queue';
import { signWorkerPayload } from '../src/auth/guards/worker-signature';

const CALLBACK_PATH = '/internal/transcode/callback';
const TITLE_PREFIX = 'e2e-callback ';

class FakeStorage extends StorageService {
  async createPresignedUpload(key: string, contentType: string) {
    return { url: `https://storage.test/${key}?type=${contentType}`, key, expiresInSecs: 900 };
  }
  async statObject(): Promise<StoredObject | null> {
    return { sizeBytes: 4096, contentType: 'video/mp4' };
  }
  async getObjectText(): Promise<string | null> { return null; }
  async createPresignedDownload(): Promise<PresignedDownload> {
    return { url: 'https://storage.test/download', expiresInSecs: 300 };
  }
  async deleteObject(): Promise<void> {}
  async deletePrefix(): Promise<void> {}
}

function outputFor(videoId: string) {
  return {
    durationSecs: 612,
    playlistKey: `videos/${videoId}/master.m3u8`,
    posterKey: `videos/${videoId}/poster.jpg`,
    renditions: [
      {
        name: '360p',
        width: 640,
        height: 360,
        bitrateKbps: 800,
        playlistKey: `videos/${videoId}/360p/playlist.m3u8`,
      },
      {
        name: '720p',
        width: 1280,
        height: 720,
        bitrateKbps: 2500,
        playlistKey: `videos/${videoId}/720p/playlist.m3u8`,
      },
    ],
  };
}

describe('Transcode callback (e2e)', () => {
  let app: INestApplication;
  let tokens: Record<Role, string>;
  let prisma: PrismaClient;
  let secret: string;
  let contentNodeId: string;

  /**
   * Signs exactly the bytes it sends. Building the body string here rather than handing
   * supertest an object is the point: the guard verifies against req.rawBody, so a test
   * that let supertest re-serialise could pass while the real contract was broken.
   */
  const send = (
    body: unknown,
    overrides: Partial<{ timestamp: string; nonce: string; signedBody: string; secret: string }> = {},
  ) => {
    const raw = JSON.stringify(body);
    const timestamp = overrides.timestamp ?? String(Math.floor(Date.now() / 1000));
    const nonce = overrides.nonce ?? 'abcdef0123456789';
    const digest = signWorkerPayload(
      overrides.secret ?? secret,
      timestamp,
      nonce,
      overrides.signedBody ?? raw,
    );

    return request(app.getHttpServer())
      .post(CALLBACK_PATH)
      .set('Content-Type', 'application/json')
      .set('x-transcode-timestamp', timestamp)
      .set('x-transcode-nonce', nonce)
      .set('x-transcode-signature', `sha256=${digest}`)
      .send(raw);
  };

  // Each test needs a row in a known state and with a known attempt token.
  const givenVideo = async (
    status: VideoStatus,
    transcodeAttempts = 1,
  ): Promise<string> => {
    const video = await prisma.video.create({
      data: {
        title: `${TITLE_PREFIX}${Date.now()}-${Math.random()}`,
        contentNodeId,
        status,
        transcodeAttempts,
      },
      select: { id: true },
    });
    return video.id;
  };

  beforeAll(async () => {
    const fixtures = await seedContentFixtures();
    contentNodeId = fixtures.g5MathsTopicId;

    prisma = new PrismaClient();
    await prisma.video.deleteMany({ where: { title: { startsWith: TITLE_PREFIX } } });

    app = await createE2eApp({
      overrideProviders: (builder) =>
        builder
          .overrideProvider(StorageService)
          .useValue(new FakeStorage())
          .overrideProvider(TranscodeQueue)
          .useValue({ enqueue: jest.fn().mockResolvedValue(undefined) }),
    });
    tokens = await loginAllRoles(app);
    secret = app.get(ConfigService).getOrThrow<string>('WORKER_CALLBACK_SECRET');
  });

  afterAll(async () => {
    await prisma.video.deleteMany({ where: { title: { startsWith: TITLE_PREFIX } } });
    await prisma.$disconnect();
    await app.close();
  });

  // The route is not @Public, and the RBAC matrix cannot express that — so this block is
  // the proof that it is closed. Every case must be 401, never 400/403/500.
  describe('authentication', () => {
    it('rejects a request with no signature headers at all', async () => {
      await request(app.getHttpServer())
        .post(CALLBACK_PATH)
        .send({ videoId: 'x', result: 'started', attempt: 1 })
        .expect(401);
    });

    it('rejects a well-formed signature made with the wrong secret', async () => {
      const id = await givenVideo(VideoStatus.QUEUED);
      await send({ videoId: id, result: 'started', attempt: 1 }, { secret: 'not-the-real-secret-not-the-real' })
        .expect(401);
    });

    it('rejects a signature over a different body than the one sent', async () => {
      const id = await givenVideo(VideoStatus.QUEUED);
      await send(
        { videoId: id, result: 'started', attempt: 1 },
        { signedBody: JSON.stringify({ videoId: id, result: 'failed', attempt: 1 }) },
      ).expect(401);
    });

    it('rejects a correctly signed request whose timestamp is 10 minutes old', async () => {
      const id = await givenVideo(VideoStatus.QUEUED);
      const stale = String(Math.floor(Date.now() / 1000) - 600);
      await send({ videoId: id, result: 'started', attempt: 1 }, { timestamp: stale }).expect(401);
    });

    // timingSafeEqual throws on a length mismatch; a 500 here would itself be an oracle.
    it('rejects a malformed signature with 401, not 500', async () => {
      const id = await givenVideo(VideoStatus.QUEUED);
      await request(app.getHttpServer())
        .post(CALLBACK_PATH)
        .set('x-transcode-timestamp', String(Math.floor(Date.now() / 1000)))
        .set('x-transcode-nonce', 'abcdef0123456789')
        .set('x-transcode-signature', 'sha256=nothex')
        .send({ videoId: id, result: 'started', attempt: 1 })
        .expect(401);
    });

    // The route is machine-to-machine. A logged-in human, even the highest-privileged one
    // in the system, must not be able to reach it.
    it('rejects a valid SUPER_ADMIN bearer token with no HMAC', async () => {
      const id = await givenVideo(VideoStatus.QUEUED);
      await request(app.getHttpServer())
        .post(CALLBACK_PATH)
        .set('Authorization', `Bearer ${tokens[Role.SUPER_ADMIN]}`)
        .send({ videoId: id, result: 'started', attempt: 1 })
        .expect(401);
    });
  });

  describe('validation', () => {
    it('400s on an unknown field', async () => {
      const id = await givenVideo(VideoStatus.QUEUED);
      await send({ videoId: id, result: 'started', attempt: 1, sneaky: true }).expect(400);
    });

    it('400s when result is missing', async () => {
      const id = await givenVideo(VideoStatus.QUEUED);
      await send({ videoId: id, attempt: 1 }).expect(400);
    });

    it('400s on a succeeded result with no output', async () => {
      const id = await givenVideo(VideoStatus.PROCESSING);
      await send({ videoId: id, result: 'succeeded', attempt: 1 }).expect(400);
    });
  });

  describe('lifecycle', () => {
    it('moves a QUEUED video to PROCESSING on started', async () => {
      const id = await givenVideo(VideoStatus.QUEUED);

      await send({ videoId: id, result: 'started', attempt: 1 })
        .expect(200)
        .expect((res) => expect(res.body).toEqual({ videoId: id, status: VideoStatus.PROCESSING }));

      const row = await prisma.video.findUniqueOrThrow({ where: { id } });
      expect(row.transcodeStartedAt).not.toBeNull();
    });

    it('publishes a PROCESSING video on succeeded, with its renditions', async () => {
      const id = await givenVideo(VideoStatus.PROCESSING);

      await send({ videoId: id, result: 'succeeded', attempt: 1, ...outputFor(id) }).expect(200);

      const row = await prisma.video.findUniqueOrThrow({
        where: { id },
        include: { renditions: { orderBy: { bitrateKbps: 'asc' } } },
      });
      expect(row.status).toBe(VideoStatus.READY);
      expect(row.durationSecs).toBe(612);
      expect(row.playlistKey).toBe(`videos/${id}/master.m3u8`);
      expect(row.posterKey).toBe(`videos/${id}/poster.jpg`);
      expect(row.renditions.map((r) => r.name)).toEqual(['360p', '720p']);
    });

    // The re-leased duplicate. BullMQ guarantees exactly-once leasing, not exactly-once
    // execution, so this is a normal event and must not duplicate rendition rows.
    it('is a no-op on a second succeeded callback', async () => {
      const id = await givenVideo(VideoStatus.PROCESSING);
      const body = { videoId: id, result: 'succeeded', attempt: 1, ...outputFor(id) };

      await send(body).expect(200);
      await send(body).expect(200);

      const row = await prisma.video.findUniqueOrThrow({
        where: { id },
        include: { renditions: true },
      });
      expect(row.status).toBe(VideoStatus.READY);
      expect(row.renditions).toHaveLength(2);
    });

    it('fails a PROCESSING video and captures the reason', async () => {
      const id = await givenVideo(VideoStatus.PROCESSING);

      await send({
        videoId: id,
        result: 'failed',
        attempt: 1,
        failureReason: 'Unsupported codec: prores',
      }).expect(200);

      const row = await prisma.video.findUniqueOrThrow({ where: { id } });
      expect(row.status).toBe(VideoStatus.FAILED);
      expect(row.failureReason).toBe('Unsupported codec: prores');
    });

    // The most important anti-corruption rule: schools may already be watching it.
    it('never demotes a READY video on a failed callback', async () => {
      const id = await givenVideo(VideoStatus.READY);

      await send({ videoId: id, result: 'failed', attempt: 1, failureReason: 'too late' })
        .expect(200)
        .expect((res) => expect(res.body.status).toBe(VideoStatus.READY));

      const row = await prisma.video.findUniqueOrThrow({ where: { id } });
      expect(row.status).toBe(VideoStatus.READY);
      expect(row.failureReason).toBeNull();
    });

    it('409s a callback carrying a superseded attempt', async () => {
      const id = await givenVideo(VideoStatus.PROCESSING, 2);

      await send({ videoId: id, result: 'succeeded', attempt: 1, ...outputFor(id) }).expect(409);

      const row = await prisma.video.findUniqueOrThrow({ where: { id } });
      expect(row.status).toBe(VideoStatus.PROCESSING);
    });

    it('409s for a video reset to UPLOADING', async () => {
      const id = await givenVideo(VideoStatus.UPLOADING);
      await send({ videoId: id, result: 'started', attempt: 1 }).expect(409);
    });

    it('404s for a video that does not exist', async () => {
      await send({ videoId: 'missing-00000000000000000000000', result: 'started', attempt: 1 })
        .expect(404);
    });
  });
});
