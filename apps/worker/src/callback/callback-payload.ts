/**
 * Mirrors apps/api/src/videos/dto/transcode-callback.dto.ts.
 *
 * The API validates with class-validator and rejects unknown fields outright
 * (forbidNonWhitelisted), so a field added here without being added there is a 400, not a
 * silently ignored extra.
 */
export type TranscodeResult = 'started' | 'succeeded' | 'failed';

export interface CallbackRendition {
  name: string;
  width: number;
  height: number;
  bitrateKbps: number;
  playlistKey: string;
}

interface BaseCallback {
  videoId: string;
  // The fencing token from the job payload, echoed unchanged. The API refuses anything
  // stale, which is what stops a worker finishing long after a retry replaced it.
  attempt: number;
}

export interface StartedCallback extends BaseCallback {
  result: 'started';
}

export interface SucceededCallback extends BaseCallback {
  result: 'succeeded';
  durationSecs: number;
  playlistKey: string;
  posterKey: string;
  renditions: CallbackRendition[];
}

export interface FailedCallback extends BaseCallback {
  result: 'failed';
  failureReason: string;
}

export type CallbackPayload = StartedCallback | SucceededCallback | FailedCallback;
