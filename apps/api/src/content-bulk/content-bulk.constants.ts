// Mirrored by `BulkContentKind` in packages/shared-types.
export enum BulkContentKind {
  VIDEO = 'VIDEO',
  DOCUMENT = 'DOCUMENT',
}

// Each item costs several queries and a presign, and is processed sequentially. Upload URLs
// also expire after 15 minutes, so a caller gains nothing from asking for far more tickets
// than it can start uploading in that window.
export const MAX_BULK_CONTENT_ITEMS = 50;
