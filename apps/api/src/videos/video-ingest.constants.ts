/**
 * The single source of truth for what may be ingested. Shared by the DTOs (which reject
 * a bad request before any upload URL is issued) and VideosService (which re-checks the
 * object that actually landed) — a client can declare anything it likes to a presigned
 * PUT, so the declared values are never trusted as proof.
 */

export const ACCEPTED_VIDEO_CONTENT_TYPES = ['video/mp4', 'video/quicktime'] as const;

export type AcceptedVideoContentType = (typeof ACCEPTED_VIDEO_CONTENT_TYPES)[number];

export const MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB

export function isAcceptedVideoContentType(
  contentType: string | null,
): contentType is AcceptedVideoContentType {
  return (
    contentType !== null &&
    (ACCEPTED_VIDEO_CONTENT_TYPES as readonly string[]).includes(contentType)
  );
}
