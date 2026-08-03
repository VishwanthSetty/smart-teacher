import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  PresignedDownload,
  PresignedUpload,
  StorageService,
  StoredObject,
} from './storage.service';

const MAX_TEXT_OBJECT_BYTES = 1024 * 1024;
const DELETE_BATCH = 1000;

/**
 * S3 adapter. Wraps the AWS SDK so it never leaks past this file — callers only ever
 * see the StorageService port.
 *
 * Talks to MinIO locally and to real S3 in production; only the endpoints and
 * S3_FORCE_PATH_STYLE differ, because MinIO cannot serve virtual-hosted bucket URLs
 * off localhost.
 */
@Injectable()
export class S3StorageService extends StorageService {
  private readonly logger = new Logger(S3StorageService.name);
  // Two clients on purpose. A presigned URL's signature covers the host it was signed
  // for, so it must be minted against the endpoint the *browser* will PUT to, while
  // stat/delete run from this process against the endpoint *it* can reach. Under
  // docker compose those are minio:9000 and localhost:9000 — signing everything with
  // the internal name would produce URLs the browser cannot resolve, and signing
  // everything with the public one would break stat/delete inside the container.
  private readonly client: S3Client;
  private readonly signingClient: S3Client;
  private readonly bucket: string;
  private readonly uploadUrlExpirySecs: number;
  private readonly downloadUrlExpirySecs: number;

  constructor(private readonly configService: ConfigService) {
    super();
    this.bucket = this.configService.getOrThrow<string>('S3_INGEST_BUCKET');
    this.uploadUrlExpirySecs = this.configService.getOrThrow<number>('S3_UPLOAD_URL_EXPIRY_SECS');
    this.downloadUrlExpirySecs =
      this.configService.getOrThrow<number>('S3_DOWNLOAD_URL_EXPIRY_SECS');

    const shared = {
      region: this.configService.getOrThrow<string>('S3_REGION'),
      forcePathStyle: this.configService.getOrThrow<boolean>('S3_FORCE_PATH_STYLE'),
      credentials: {
        accessKeyId: this.configService.getOrThrow<string>('S3_ACCESS_KEY_ID'),
        secretAccessKey: this.configService.getOrThrow<string>('S3_SECRET_ACCESS_KEY'),
      },
    };

    this.client = new S3Client({
      ...shared,
      endpoint: this.configService.getOrThrow<string>('S3_ENDPOINT'),
    });
    this.signingClient = new S3Client({
      ...shared,
      endpoint: this.configService.getOrThrow<string>('S3_PUBLIC_ENDPOINT'),
    });
  }

  async createPresignedUpload(key: string, contentType: string): Promise<PresignedUpload> {
    // ContentType is signed so the object is stored with the right type, but do NOT
    // treat that as enforcement: whether a mismatch is rejected depends on the provider
    // putting content-type in SignedHeaders, and MinIO accepts a PUT that declares
    // something else. The type that counts is the one read back off the stored object at
    // confirm time — see VideosService.markUploaded.
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });

    const url = await this.wrapSdkErrors(
      () => getSignedUrl(this.signingClient, command, { expiresIn: this.uploadUrlExpirySecs }),
      `presign upload for ${key}`,
    );

    return { url, key, expiresInSecs: this.uploadUrlExpirySecs };
  }

  async statObject(key: string): Promise<StoredObject | null> {
    try {
      const head = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return {
        // A zero-byte object is a real (failed) upload, not a missing one, so `?? 0`
        // rather than treating an absent ContentLength as "not there".
        sizeBytes: head.ContentLength ?? 0,
        contentType: head.ContentType ?? null,
      };
    } catch (error) {
      if (this.isNotFound(error)) {
        return null;
      }
      throw this.toInternalError(error, `stat object ${key}`);
    }
  }

  async getObjectText(key: string): Promise<string | null> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      if ((response.ContentLength ?? 0) > MAX_TEXT_OBJECT_BYTES || response.Body === undefined) {
        throw new InternalServerErrorException('Stored manifest is invalid');
      }
      return await boundedText(response.Body);
    } catch (error) {
      if (this.isNotFound(error)) {
        return null;
      }
      if (error instanceof InternalServerErrorException) {
        throw error;
      }
      throw this.toInternalError(error, `read object ${key}`);
    }
  }

  async createPresignedDownload(key: string): Promise<PresignedDownload> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    const url = await this.wrapSdkErrors(
      () => getSignedUrl(this.signingClient, command, { expiresIn: this.downloadUrlExpirySecs }),
      `presign download for ${key}`,
    );
    return { url, expiresInSecs: this.downloadUrlExpirySecs };
  }

  async deleteObject(key: string): Promise<void> {
    await this.wrapSdkErrors(
      () => this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key })),
      `delete object ${key}`,
    );
  }

  async deletePrefix(prefix: string): Promise<void> {
    if (!prefix.endsWith('/')) {
      throw new InternalServerErrorException('Storage prefix must end with a slash');
    }

    let continuationToken: string | undefined;
    do {
      const listed = await this.wrapSdkErrors(
        () =>
          this.client.send(
            new ListObjectsV2Command({
              Bucket: this.bucket,
              Prefix: prefix,
              ContinuationToken: continuationToken,
              MaxKeys: DELETE_BATCH,
            }),
          ),
        `list prefix ${prefix}`,
      );
      const keys = (listed.Contents ?? [])
        .map((object) => object.Key)
        .filter((key): key is string => typeof key === 'string');
      if (keys.length > 0) {
        await this.wrapSdkErrors(
          () =>
            this.client.send(
              new DeleteObjectsCommand({
                Bucket: this.bucket,
                Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
              }),
            ),
          `delete prefix ${prefix}`,
        );
      }
      continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
    } while (continuationToken !== undefined);
  }

  // A missing object is an expected outcome of statObject, not a failure: the admin
  // may simply never have completed the upload.
  private isNotFound(error: unknown): boolean {
    if (error instanceof S3ServiceException) {
      return error.name === 'NotFound' || error.$metadata.httpStatusCode === 404;
    }
    return false;
  }

  private async wrapSdkErrors<T>(operation: () => Promise<T>, description: string): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      throw this.toInternalError(error, description);
    }
  }

  // Translate SDK failures here rather than letting them reach the global filter's
  // catch-all branch, which would log a vendor stack trace against every storage blip.
  private toInternalError(error: unknown, description: string): InternalServerErrorException {
    const reason = error instanceof Error ? error.message : String(error);
    this.logger.error(`Storage operation failed (${description}): ${reason}`);
    return new InternalServerErrorException('Storage is unavailable');
  }
}

async function boundedText(body: unknown): Promise<string> {
  if (
    typeof body !== 'object' ||
    body === null ||
    !(Symbol.asyncIterator in body) ||
    typeof body[Symbol.asyncIterator] !== 'function'
  ) {
    throw new InternalServerErrorException('Stored manifest is invalid');
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of body as AsyncIterable<Uint8Array>) {
    total += chunk.byteLength;
    if (total > MAX_TEXT_OBJECT_BYTES) {
      throw new InternalServerErrorException('Stored manifest is invalid');
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}
