# Bulk content upload

Lets a SUPER_ADMIN upload many videos and PDFs in one session, instead of one form submission
per file.

## Decisions

- **No new table or migration.** Each file becomes an ordinary `Video` or `Document` row through
  the existing `VideosService.create` / `DocumentsService.create`, so every ingest rule still
  applies. There is no persistent batch: the queue lives in the browser tab, because the browser
  holds the file bytes and a batch could not resume without them anyway.
- **Partial success.** One refused file reports its own error and never fails the batch, as in the
  teacher and student imports. Both routes answer `200` with a per-item outcome.
- **Bytes go straight to storage**, using the same presigned PUT flow as the single-file form.

## API

Both routes are `SUPER_ADMIN` only and accept up to 50 items.

| Route | Purpose |
| --- | --- |
| `POST /admin/content/bulk` | Creates each item in `UPLOADING` and returns its presigned PUT, or its error |
| `POST /admin/content/bulk/confirm` | Verifies each stored file. Videos move to `QUEUED`, documents to `READY` |

To replace an expired URL, use the existing `POST /admin/{videos,documents}/:id/upload-url`.

## Screen: `/dashboard/content-library/bulk`

Pick a destination, drop files, adjust titles, then upload. Selected rows can be re-filed in one
action, and failed rows can be retried singly or together.

- **Three uploads at a time.** More would saturate the operator's connection.
- **Records are created six at a time, as uploads free up.** Upload URLs last 15 minutes, and
  closing the tab should strand a few `UPLOADING` rows rather than one for every waiting file. A
  URL that goes stale while waiting is re-minted before its upload starts.
- **Retry does the least it can.** If the bytes landed and only the confirmation failed, retry
  confirms without uploading again. If the API refused the stored file, retry uploads it again.
- **Middleware covers `/api/content/*` and `/api/documents/*`.** A batch can outlast the 15-minute
  access token with no page navigation, so these BFF calls need the same refresh as `/api/videos/*`.

## Not in this version

- A CSV manifest or folder-name matching to file many topics automatically.
- Resuming after the tab closes. Leftover `UPLOADING` rows are retried or deleted from the library.
- Duplicate detection against content already in the library. Only re-adding the same file to the
  current queue is caught.
