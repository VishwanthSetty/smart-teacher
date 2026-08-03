/**
 * Object storage port.
 *
 * An owned interface for the same reason apps/api/src/storage/storage.service.ts is one:
 * the AWS SDK must not leak past its single adapter. Note the surface is *not* the API's
 * — the worker reads and writes objects, it never presigns for a browser — which is why
 * this is its own port rather than a shared one.
 */
export abstract class ObjectStorage {
  /** Streams an object to disk. Never buffers: sources run to 2 GB. */
  abstract getToFile(key: string, destination: string): Promise<void>;

  abstract putFile(key: string, source: string, contentType: string): Promise<void>;

  /** Clears a whole output prefix, so a re-run with a narrower ladder leaves no orphans. */
  abstract deletePrefix(prefix: string): Promise<void>;
}
