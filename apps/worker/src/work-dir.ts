import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Runs `fn` in a private scratch directory and removes it whatever happens.
 *
 * The finally is the point: a source plus its HLS output is several GB, and with
 * CONCURRENCY jobs in flight a single leaked directory per failure fills the scratch
 * volume within a batch. Cleanup is best-effort — failing to remove a temp directory must
 * never turn a successful transcode into a failed one.
 */
export async function withWorkDir<T>(root: string, fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(root, 'transcode-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
