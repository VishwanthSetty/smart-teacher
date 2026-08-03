import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { TranscodeJob, TranscodeQueue } from './transcode-queue';

// Errors, not stalls: a transient S3 blip or DNS failure deserves a retry, whereas a
// worker that died holding the job is handled by BullMQ's stalled-job detection on the
// consumer side (see apps/worker's lock constants).
const JOB_ATTEMPTS = 3;
const BACKOFF_DELAY_MS = 30_000;

// Bounded Redis memory across a bulk ingest. Failures are kept a week because they are
// what an operator diagnoses from; successes are disposable once the row says READY.
const KEEP_COMPLETED_SECS = 24 * 60 * 60;
const KEEP_COMPLETED_COUNT = 1_000;
const KEEP_FAILED_SECS = 7 * 24 * 60 * 60;

/**
 * The BullMQ binding for the transcode queue port.
 *
 * Bound unconditionally, with no env flag to swap it out. An env-selected adapter means a
 * production misconfiguration silently routes every video into a no-op, where they sit in
 * QUEUED forever with nothing in any log to explain it. StorageModule binds its S3
 * adapter the same way.
 */
@Injectable()
export class RedisTranscodeQueue extends TranscodeQueue implements OnModuleDestroy {
  private readonly logger = new Logger(RedisTranscodeQueue.name);
  private queueInstance: Queue<TranscodeJob> | null = null;

  constructor(private readonly configService: ConfigService) {
    super();
  }

  async enqueue(job: TranscodeJob): Promise<void> {
    await this.queue().add('transcode', job, {
      // Deterministic per attempt. A double-clicked "mark uploaded" within one attempt
      // dedupes, while a deliberate re-transcode — which bumps the attempt — still
      // enqueues. A bare videoId would make the retry route a silent no-op.
      //
      // Separated by "-", not ":": BullMQ rejects a custom id containing a colon outright
      // ("Custom Id cannot contain :"), since that is Redis's own key separator. Video ids
      // are cuids, so they never contain a "-" of their own to confuse this.
      jobId: `${job.videoId}-${job.attempt}`,
      attempts: JOB_ATTEMPTS,
      backoff: { type: 'exponential', delay: BACKOFF_DELAY_MS },
      removeOnComplete: { age: KEEP_COMPLETED_SECS, count: KEEP_COMPLETED_COUNT },
      removeOnFail: { age: KEEP_FAILED_SECS },
    });

    this.logger.log(`Enqueued transcode for video ${job.videoId} (attempt ${job.attempt}).`);
  }

  /**
   * Built on first use, never in the constructor.
   *
   * Every e2e spec instantiates the whole AppModule. An eager connection would make every
   * one of them — including the many that never touch a video — open an ioredis client
   * that retries forever against a Redis nobody started, hanging the run. Specs that do
   * enqueue override this provider outright (see videos.e2e-spec.ts).
   */
  private queue(): Queue<TranscodeJob> {
    if (this.queueInstance === null) {
      this.queueInstance = new Queue<TranscodeJob>(
        this.configService.getOrThrow<string>('TRANSCODE_QUEUE_NAME'),
        {
          connection: {
            url: this.configService.getOrThrow<string>('REDIS_URL'),
            // BullMQ requires this on the consumer side and it costs nothing here; keeping
            // both ends identical avoids a surprise if this client is ever reused.
            maxRetriesPerRequest: null,
          },
        },
      );
    }
    return this.queueInstance;
  }

  // Without this, Jest reports the ioredis socket as an open handle and the process hangs
  // after the suite finishes.
  async onModuleDestroy(): Promise<void> {
    await this.queueInstance?.close();
  }
}
