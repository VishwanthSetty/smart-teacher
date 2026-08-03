import { createHmac, timingSafeEqual } from 'node:crypto';

export const WORKER_TIMESTAMP_HEADER = 'x-transcode-timestamp';
export const WORKER_NONCE_HEADER = 'x-transcode-nonce';
export const WORKER_SIGNATURE_HEADER = 'x-transcode-signature';

const SIGNATURE_PREFIX = 'sha256=';
const HEX_SHA256 = /^[0-9a-f]{64}$/;

/**
 * The signing contract, shared by both sides of the callback.
 *
 * DUPLICATED, deliberately: the worker's copy is apps/worker/src/callback/signature.ts.
 * apps/api consumes no @smart-teacher/* runtime package today, and whether `nest build`
 * (tsc, CommonJS, no path mapping) resolves a TS-source workspace package is unproven
 * here — betting the build on it to share eight lines is the worse trade. Drift is caught
 * instead by SIGNATURE_FIXTURE below, asserted from specs in both apps.
 *
 * Signed over the raw request bytes, never a re-serialised body: JSON.stringify would
 * reorder keys and normalise whitespace, and the signature would never match.
 */
export function signWorkerPayload(
  secret: string,
  timestamp: string,
  nonce: string,
  rawBody: string,
): string {
  return createHmac('sha256', secret).update(`${timestamp}.${nonce}.${rawBody}`).digest('hex');
}

/**
 * Constant-time compare of a presented `sha256=<hex>` header against the expected digest.
 *
 * The shape check is not cosmetic: timingSafeEqual throws on a length mismatch, and an
 * unguarded throw is itself an oracle — a caller could distinguish "wrong length" from
 * "wrong value" by the 500 it produces.
 */
export function isValidWorkerSignature(presented: string, expected: string): boolean {
  if (!presented.startsWith(SIGNATURE_PREFIX)) {
    return false;
  }

  const digest = presented.slice(SIGNATURE_PREFIX.length);
  if (!HEX_SHA256.test(digest)) {
    return false;
  }

  return timingSafeEqual(Buffer.from(digest, 'hex'), Buffer.from(expected, 'hex'));
}

/**
 * The cross-app drift detector. The identical literal appears in
 * apps/worker/src/callback/signature.spec.ts; if either side's canonicalisation changes,
 * one of the two specs fails rather than production callbacks silently 401ing.
 */
export const SIGNATURE_FIXTURE = {
  secret: 'fixture-secret-do-not-use-in-production-0123',
  timestamp: '1767225600',
  nonce: 'a1b2c3d4e5f60718',
  body: '{"videoId":"vid_fixture","result":"succeeded"}',
  expected: '1b5f482b797cec6989490aa54d478f18965b5698fedc0e1b70c0d59e7c3ca18a',
} as const;
