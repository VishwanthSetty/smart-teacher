import 'reflect-metadata';
import { cpus } from 'node:os';
import { access, mkdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import { CallbackClient } from './callback/callback-client';
import { validateWorkerEnv, WorkerEnvironment } from './config/env.validation';
import { Logger } from './logging/logger';
import { createTranscodeWorker } from './queue/transcode-worker';
import { S3ObjectStorage } from './storage/s3-object-storage';
import { assertFfmpegVersion } from './transcode/ffmpeg';
import { parseRenditionLadder } from './transcode/rendition-ladder';

/**
 * Composition root.
 *
 * Plain Node, not Nest, and that is a deliberate deviation worth stating: Nest's value is
 * HTTP — controllers, guards, pipes, the request lifecycle — and this process has no HTTP
 * surface at all. It is outbound-only by design, which is exactly what lets the same image
 * run behind NAT on a laptop and on a cloud VM with nothing but different env vars. A DI
 * container buys nothing for five objects wired once at boot.
 *
 * What does carry over from apps/api, because it earns its keep: a class-validator env
 * class that fails at boot, and the adapter pattern keeping the AWS SDK behind one file.
 */
async function bootstrap(): Promise<void> {
  const logger = new Logger('worker');

  // Everything that can be wrong is checked before a single job is leased. A worker that
  // starts and then fails every job is far worse than one that refuses to start.
  const env: WorkerEnvironment = validateWorkerEnv(process.env);
  const ffmpegVersion = await assertFfmpegVersion(env.EXPECTED_FFMPEG_VERSION);
  const ladder = parseRenditionLadder(env.RENDITION_LADDER);
  await ensureWritable(env.WORK_DIR);

  // Divided so concurrent jobs do not oversubscribe the machine and thrash. Every job
  // shares one event loop, and a thrashing box is a box whose lock renewals run late.
  const threads = Math.max(1, Math.floor(cpus().length / env.CONCURRENCY));

  const worker = createTranscodeWorker({
    env,
    ladder,
    storage: new S3ObjectStorage(env),
    callback: new CallbackClient(env.CALLBACK_URL, env.WORKER_CALLBACK_SECRET),
    logger,
    threads,
  });

  logger.info('Transcode worker ready', {
    queue: env.TRANSCODE_QUEUE_NAME,
    concurrency: env.CONCURRENCY,
    ladder: ladder.map((rendition) => rendition.name).join(','),
    hwaccel: env.HWACCEL,
    ffmpegVersion,
    threadsPerJob: threads,
  });

  // Essential, not housekeeping: a graceful close stops taking new jobs and drains the
  // active ones. Without it every `docker compose restart` orphans in-flight jobs into a
  // 90-second stall cycle, and their partial output sits in the bucket until the next run
  // clears the prefix.
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => {
      logger.info('Shutting down; draining active jobs', { signal });
      void worker.close().then(
        () => process.exit(0),
        (error: Error) => {
          logger.error('Unclean shutdown', { reason: error.message });
          process.exit(1);
        },
      );
    });
  }
}

async function ensureWritable(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  try {
    await access(dir, constants.W_OK);
  } catch {
    throw new Error(`WORK_DIR ${dir} is not writable; every transcode would fail on download.`);
  }
}

bootstrap().catch((error: unknown) => {
  const reason = error instanceof Error ? error.message : String(error);
  new Logger('worker').error('Failed to start', { reason });
  process.exit(1);
});
