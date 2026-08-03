export interface PresignedUpload {
  url: string;
  key: string;
  expiresInSecs: number;
}

export interface PresignedDownload {
  url: string;
  expiresInSecs: number;
}

export interface StoredObject {
  sizeBytes: number;
  contentType: string | null;
}

/**
 * Object storage port. Owned interface wrapping the S3 SDK so the vendor never leaks
 * into feature services — see S3StorageService for the implementation.
 *
 * The presigned upload exists so large media never passes through this process: the
 * browser PUTs straight to the bucket. Nothing here streams media bytes;
 * getObjectText only buffers a bounded, small manifest.
 */
export abstract class StorageService {
  /** Short-lived, single-key PUT. The URL must not authorise any other object. */
  abstract createPresignedUpload(key: string, contentType: string): Promise<PresignedUpload>;

  /** Null when the object does not exist — i.e. the upload never completed. */
  abstract statObject(key: string): Promise<StoredObject | null>;

  /** Reads a small text object, capped by the adapter at 1 MiB. Never use for media. */
  abstract getObjectText(key: string): Promise<string | null>;

  /** Short-lived browser-facing GET capability for one object. */
  abstract createPresignedDownload(key: string): Promise<PresignedDownload>;

  abstract deleteObject(key: string): Promise<void>;

  /** Deletes every object under a caller-supplied prefix ending in '/'. */
  abstract deletePrefix(prefix: string): Promise<void>;
}
