/** Mirrors apps/api/src/transcoding/transcode-queue.ts. */
export interface TranscodeJobData {
  videoId: string;
  sourceKey: string;
  attempt: number;
}

/**
 * Narrows a job payload read back out of Redis.
 *
 * BullMQ hands back whatever JSON was stored, typed as the generic the producer declared —
 * a claim, not a guarantee. A job written by an older API version, or by hand during
 * debugging, would otherwise reach the pipeline as undefined fields and fail somewhere far
 * less legible than here.
 */
export function narrowTranscodeJob(data: unknown): TranscodeJobData {
  if (typeof data !== 'object' || data === null) {
    throw new Error('Transcode job payload is not an object.');
  }

  const { videoId, sourceKey, attempt } = data as Record<string, unknown>;

  if (typeof videoId !== 'string' || videoId.length === 0) {
    throw new Error('Transcode job payload has no videoId.');
  }
  if (typeof sourceKey !== 'string' || sourceKey.length === 0) {
    throw new Error('Transcode job payload has no sourceKey.');
  }
  if (typeof attempt !== 'number' || !Number.isInteger(attempt) || attempt < 1) {
    throw new Error('Transcode job payload has no valid attempt token.');
  }

  return { videoId, sourceKey, attempt };
}
