export interface TranscodeJob {
  videoId: string;
  sourceKey: string;
  // The row's transcodeAttempts at enqueue time. The worker echoes it on every callback,
  // and TranscodeCallbackService refuses anything stale — which is what stops a worker
  // that finishes long after a retry replaced it from overwriting the newer result.
  attempt: number;
}

/**
 * Transcode queue port. Owned interface so the broker never leaks into VideosService.
 *
 * Consumed by apps/worker, a separate containerised process that may run on a laptop or a
 * cloud VM against the same queue. Note the asymmetry: this side only ever *produces*.
 * Results come back over the signed HTTP callback (TranscodeCallbackController), never by
 * the worker writing to the database — which is why a worker needs no DATABASE_URL.
 */
export abstract class TranscodeQueue {
  abstract enqueue(job: TranscodeJob): Promise<void>;
}
