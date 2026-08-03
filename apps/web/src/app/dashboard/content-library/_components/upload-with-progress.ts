/**
 * The one place in this app that talks to something other than our own API, and the one
 * place that uses XMLHttpRequest. Both are deliberate, and both are confined to this file.
 *
 * Not lib/api-client.ts: that module is server-only and attaches the caller's bearer
 * token, which must never be sent to the storage bucket. The whole point of a presigned
 * PUT is that the bytes go straight from the browser to the bucket without passing
 * through this app or the API.
 *
 * Not fetch: fetch exposes no upload-progress event, and showing progress is a
 * requirement for files that can run to gigabytes.
 */
export interface UploadProgress {
  loadedBytes: number;
  totalBytes: number;
  percent: number;
}

export interface UploadOptions {
  url: string;
  file: File;
  contentType: string;
  onProgress: (progress: UploadProgress) => void;
  signal?: AbortSignal;
}

export function uploadWithProgress({
  url,
  file,
  contentType,
  onProgress,
  signal,
}: UploadOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    // Must match the type bound into the signature, or the bucket rejects the PUT.
    xhr.setRequestHeader('Content-Type', contentType);

    xhr.upload.addEventListener('progress', (event) => {
      if (!event.lengthComputable) {
        return;
      }
      onProgress({
        loadedBytes: event.loaded,
        totalBytes: event.total,
        percent: Math.round((event.loaded / event.total) * 100),
      });
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      // The bucket answers XML, not our ApiErrorResponse shape, so there is no message
      // worth surfacing — an expired or malformed signature is a 403 here.
      reject(new Error(`Upload failed (${xhr.status}). The link may have expired — try again.`));
    });

    xhr.addEventListener('error', () => {
      // Fires for network failures *and* for a missing CORS rule on the bucket, which
      // is indistinguishable from here.
      reject(new Error('Upload failed. Check your connection and try again.'));
    });

    xhr.addEventListener('abort', () => {
      reject(new DOMException('Upload cancelled', 'AbortError'));
    });

    signal?.addEventListener('abort', () => xhr.abort(), { once: true });

    xhr.send(file);
  });
}
