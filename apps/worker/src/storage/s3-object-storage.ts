import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { WorkerEnvironment } from '../config/env.validation';
import { ObjectStorage } from './object-storage';

// S3 caps a single DeleteObjects call at 1000 keys.
const DELETE_BATCH = 1000;

export class S3ObjectStorage extends ObjectStorage {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(env: WorkerEnvironment) {
    super();
    // One client, unlike the API's two: the worker never presigns for a browser, so there
    // is no second "public endpoint" to sign against.
    this.client = new S3Client({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      },
    });
    this.bucket = env.S3_INGEST_BUCKET;
  }

  async getToFile(key: string, destination: string): Promise<void> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );

    if (!(response.Body instanceof Readable)) {
      throw new Error(`Storage returned no readable body for ${key}.`);
    }

    // Streamed, never buffered. Concatenating a 2 GB body into a Buffer would stall the
    // event loop long enough for BullMQ to stop renewing this job's lock — at which point
    // another worker picks the job up and two ffmpeg processes write the same keys.
    await pipeline(response.Body, createWriteStream(destination));
  }

  async putFile(key: string, source: string, contentType: string): Promise<void> {
    // lib-storage rather than PutObjectCommand: it handles multipart automatically, which
    // matters for a 720p segment set over a home upstream link.
    const upload = new Upload({
      client: this.client,
      params: {
        Bucket: this.bucket,
        Key: key,
        Body: createReadStream(source),
        ContentType: contentType,
      },
    });

    await upload.done();
  }

  async deletePrefix(prefix: string): Promise<void> {
    let continuationToken: string | undefined;

    do {
      const listed = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
          MaxKeys: DELETE_BATCH,
        }),
      );

      const keys = (listed.Contents ?? [])
        .map((object) => object.Key)
        .filter((key): key is string => typeof key === 'string');

      if (keys.length > 0) {
        await this.client.send(
          new DeleteObjectsCommand({
            Bucket: this.bucket,
            Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
          }),
        );
      }

      continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
    } while (continuationToken !== undefined);
  }
}
