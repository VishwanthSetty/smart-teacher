import { createHmac, randomBytes } from 'node:crypto';

export const WORKER_TIMESTAMP_HEADER = 'x-transcode-timestamp';
export const WORKER_NONCE_HEADER = 'x-transcode-nonce';
export const WORKER_SIGNATURE_HEADER = 'x-transcode-signature';

/**
 * The signing contract, shared by both sides of the callback.
 *
 * DUPLICATED, deliberately: the API's copy is
 * apps/api/src/auth/guards/worker-signature.ts. apps/api consumes no @smart-teacher/*
 * runtime package today, and whether `nest build` (tsc, CommonJS, no path mapping)
 * resolves a TS-source workspace package is unproven — betting the build on it to share
 * eight lines is the worse trade. Drift is caught instead by SIGNATURE_FIXTURE, whose
 * identical literal is asserted from specs in both apps.
 *
 * Signed over the exact bytes that go on the wire, never a re-serialised object.
 */
export function signWorkerPayload(
  secret: string,
  timestamp: string,
  nonce: string,
  rawBody: string,
): string {
  return createHmac('sha256', secret).update(`${timestamp}.${nonce}.${rawBody}`).digest('hex');
}

export interface SignedHeaders {
  [header: string]: string;
}

/**
 * Signs a request body and returns the headers to send with it.
 *
 * The nonce is included in the signature from day one even though the API does not yet
 * keep a nonce store: having it in the protocol means enforcing replay rejection later
 * needs a server change only, never a worker redeploy across a fleet that may include
 * someone's laptop.
 */
export function signRequest(secret: string, rawBody: string): SignedHeaders {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = randomBytes(8).toString('hex');

  return {
    [WORKER_TIMESTAMP_HEADER]: timestamp,
    [WORKER_NONCE_HEADER]: nonce,
    [WORKER_SIGNATURE_HEADER]: `sha256=${signWorkerPayload(secret, timestamp, nonce, rawBody)}`,
  };
}

/**
 * The cross-app drift detector. The identical literal appears in
 * apps/api/src/auth/guards/worker-signature.ts; if either side's canonicalisation
 * changes, one of the two specs fails rather than production callbacks silently 401ing.
 */
export const SIGNATURE_FIXTURE = {
  secret: 'fixture-secret-do-not-use-in-production-0123',
  timestamp: '1767225600',
  nonce: 'a1b2c3d4e5f60718',
  body: '{"videoId":"vid_fixture","result":"succeeded"}',
  expected: '1b5f482b797cec6989490aa54d478f18965b5698fedc0e1b70c0d59e7c3ca18a',
} as const;
