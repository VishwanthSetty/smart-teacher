import { utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Job, Worker } from 'bullmq';
import {
  CallbackClient,
  CallbackRejectedError,
  CallbackUnavailableError,
} from '../callback/callback-client';
import { WorkerEnvironment } from '../config/env.validation';
import { Logger } from '../logging/logger';
import { ObjectStorage } from '../storage/object-storage';
import { FfmpegError } from '../transcode/ffmpeg';
import { classifyFfmpegFailure } from '../transcode/ffmpeg-error';
import { Rendition } from '../transcode/rendition-ladder';
import { transcodeVideo } from '../transcode/transcode-video';
import { withWorkDir } from '../work-dir';
import { narrowTranscodeJob, TranscodeJobData } from './transcode-job';

/**
 * Lock timings, deliberately constants rather than env knobs.
 *
 * These must be consistent across a heterogeneous fleet. An env knob invites a laptop and
 * a cloud VM to disagree, and the only symptom is duplicate transcodes under load —
 * discovered late, from the outside.
 *
 * BullMQ guarantees exactly-once *leasing*: the wait -> active move is an atomic Lua
 * script against single-threaded Redis, so two workers can never hold one job. It does not
 * guarantee exactly-once *execution* — a crashed worker's job is re-run by design, which
 * is why the API's callback is idempotent and carries a fencing token.
 */
// Jobs run for minutes. BullMQ's 30s default leaves no slack: one long GC pause or a slow
// multipart flush and a perfectly healthy job is declared dead while its ffmpeg is still
// running — producing exactly the duplicate execution the lock exists to prevent.
const LOCK_DURATION_MS = 60_000;
// Detection granularity: worst case a crashed worker's job waits ~90s before re-queueing.
const STALLED_INTERVAL_MS = 30_000;
// One free re-queue after a crash. A second stall means the job reliably kills its worker
// (OOM on a huge source), and cycling it forever would starve the queue.
const MAX_STALLED_COUNT = 1;

const HEARTBEAT_FILE = '.heartbeat';
// Comfortably inside the compose healthcheck's staleness window, so an ordinary tick
// never looks like a wedged process.
const HEARTBEAT_INTERVAL_MS = 15_000;

export interface TranscodeWorkerDeps {
  env: WorkerEnvironment;
  ladder: Rendition[];
  storage: ObjectStorage;
  callback: CallbackClient;
  logger: Logger;
  threads: number;
}

export function createTranscodeWorker(deps: TranscodeWorkerDeps): Worker {
  const { env, logger } = deps;

  const worker = new Worker(
    env.TRANSCODE_QUEUE_NAME,
    async (job: Job) => processJob(job, deps),
    {
      connection: { url: env.REDIS_URL, maxRetriesPerRequest: null },
      concurrency: env.CONCURRENCY,
      lockDuration: LOCK_DURATION_MS,
      stalledInterval: STALLED_INTERVAL_MS,
      maxStalledCount: MAX_STALLED_COUNT,
    },
  );

  // The worker is outbound-only and has no port to probe, so liveness is a file whose
  // mtime the queue loop touches. A stale mtime means a wedged event loop — which is also
  // exactly what would silently stop BullMQ renewing job locks.
  const beat = () => touchHeartbeat(env.WORK_DIR).catch(() => undefined);
  worker.on('active', beat);
  worker.on('completed', beat);
  worker.on('drained', beat);

  // A timer as well as the events, for two reasons: an idle worker fires no events at all
  // and would otherwise look dead, and a timer that stops running *is* the failure mode
  // being probed for — the same blocked loop that would stop lock renewal.
  const ticker = setInterval(beat, HEARTBEAT_INTERVAL_MS);
  // Never a reason to keep the process alive on its own during shutdown.
  ticker.unref();
  worker.on('closing', () => clearInterval(ticker));
  void beat();

  worker.on('error', (error) => logger.error('Worker error', { reason: error.message }));

  worker.on('stalled', (jobId) =>
    logger.warn('Job stalled and was re-queued; the lock expired while it was active', { jobId }),
  );

  // BullMQ has exhausted `attempts` for a retryable error. Report the failure now rather
  // than leaving the row to the API's reconciler ~45 minutes later.
  worker.on('failed', (job, error) => {
    logger.error('Job failed', { jobId: job?.id, reason: error.message });
    if (job === undefined || job.attemptsMade < (job.opts.attempts ?? 1)) {
      return;
    }
    void reportExhaustion(job, deps);
  });

  return worker;
}

async function processJob(job: Job, deps: TranscodeWorkerDeps): Promise<void> {
  const { env, ladder, storage, callback, logger, threads } = deps;
  const data = narrowTranscodeJob(job.data);
  const fields = { videoId: data.videoId, jobId: job.id, attempt: data.attempt };

  // Claiming the job before downloading anything doubles as a free "is this still wanted?"
  // check: a 4xx here means the video was deleted, superseded or already published, and
  // aborting now saves an entire transcode.
  try {
    await callback.send({ videoId: data.videoId, attempt: data.attempt, result: 'started' });
  } catch (error) {
    if (error instanceof CallbackRejectedError) {
      logger.warn('Abandoning a job the API no longer wants', { ...fields, status: error.status });
      return;
    }
    throw error;
  }

  logger.info('Transcoding', fields);

  try {
    const output = await withWorkDir(env.WORK_DIR, (workDir) =>
      transcodeVideo(data, workDir, { storage, ladder, hwaccel: env.HWACCEL, threads, logger }),
    );

    await callback.send({
      videoId: data.videoId,
      attempt: data.attempt,
      result: 'succeeded',
      ...output,
    });

    logger.info('Transcode complete', { ...fields, durationSecs: output.durationSecs });
  } catch (error) {
    await handleFailure(error, data, deps, fields);
  }
}

/**
 * Decides whether a failure is the job's fault or the world's.
 *
 * Terminal — a corrupt source, an unsupported codec — is reported as `failed` and the job
 * *resolves*. Retrying a corrupt file three times with exponential backoff is pure waste
 * and delays the admin's feedback by minutes. Everything else is rethrown so BullMQ
 * retries it.
 */
async function handleFailure(
  error: unknown,
  data: TranscodeJobData,
  deps: TranscodeWorkerDeps,
  fields: Record<string, unknown>,
): Promise<void> {
  const { callback, logger } = deps;

  // The API said this job is no longer wanted; nothing left to report.
  if (error instanceof CallbackRejectedError) {
    logger.warn('The API rejected the result', { ...fields, status: error.status });
    return;
  }
  // The API is unwell, not the job. Retry the whole thing.
  if (error instanceof CallbackUnavailableError) {
    throw error;
  }

  // A process killed by a signal (for example SIGSEGV) commonly has no stderr. Preserve
  // the process-level diagnostic instead of collapsing it to "unknown reason".
  const stderr = error instanceof FfmpegError ? error.stderr || error.message : String(error);
  const { reason, terminal } = classifyFfmpegFailure(stderr);

  if (!terminal) {
    logger.warn('Retryable transcode failure', { ...fields, reason });
    throw error;
  }

  logger.error('Terminal transcode failure', { ...fields, reason });
  await callback.send({
    videoId: data.videoId,
    attempt: data.attempt,
    result: 'failed',
    failureReason: reason,
  });
}

async function reportExhaustion(job: Job, deps: TranscodeWorkerDeps): Promise<void> {
  try {
    const data = narrowTranscodeJob(job.data);
    await deps.callback.send({
      videoId: data.videoId,
      attempt: data.attempt,
      result: 'failed',
      failureReason: 'Transcoding failed repeatedly and was given up on.',
    });
  } catch (error) {
    // Best effort: if this cannot be delivered the API's reconciler still sweeps the row.
    const reason = error instanceof Error ? error.message : String(error);
    deps.logger.error('Could not report a give-up to the API', { jobId: job.id, reason });
  }
}

async function touchHeartbeat(workDir: string): Promise<void> {
  const path = join(workDir, HEARTBEAT_FILE);
  const now = new Date();
  try {
    await utimes(path, now, now);
  } catch {
    // First beat of this container's life: the file does not exist yet.
    await writeFile(path, '');
  }
}
