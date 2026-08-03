# Transcode worker

Leases a job from Redis, transcodes the uploaded source to an HLS ladder, uploads the
output to the ingest bucket under `videos/{videoId}/`, and reports the result back to the
API over a signed HTTP callback.

Nothing else consumes the transcode queue. Without a worker running, an ingested video
sits in `QUEUED` and never becomes watchable — school-facing reads only ever return
`READY` content.

## Where it runs

The identical image runs on a laptop behind NAT or on a cloud VM; only env values differ.
It accepts **no inbound connections** — no port, no `EXPOSE` — reaching out to Redis, the
bucket and the callback URL instead. That is what makes a worker on someone's desk a
first-class member of the fleet with no tunnelling.

Two absences in its environment are security properties, not oversights:

- **No `DATABASE_URL`.** Every result travels over the signed callback, never a direct
  write. A compromised worker box holds no database credential.
- **No `S3_PUBLIC_ENDPOINT`.** The worker never presigns for a browser, so it needs one S3
  client where the API needs two.

It does hold a bucket credential and the callback secret, so treat the machine as trusted —
never a shared or public one. In production, scope the credential to `s3:GetObject` on
`*/source.mp4` and `s3:PutObject`/`s3:DeleteObject` on `videos/*` rather than handing it a
root key.

Browser playback follows API redirects to short-lived presigned segment URLs. A production
S3 bucket therefore needs CORS allowing `GET` and `HEAD` from any origin (`AllowedOrigins:
['*']`) and should expose `Content-Length`, `Content-Range`, `Accept-Ranges`, and `ETag`.
Redirected cross-origin media requests may carry a null origin, so restricting this rule to
the web-app origin breaks hls.js and native HLS; authorization remains in the signed URL.
Compose configures MinIO's `MINIO_API_CORS_ALLOW_ORIGIN=*` explicitly for the same reason.

## Running it

Under compose it is in the default profile and needs nothing:

```bash
docker compose up -d --build
```

Natively (requires ffmpeg on `PATH` at the version in `EXPECTED_FFMPEG_VERSION`):

```bash
cp apps/worker/.env.example apps/worker/.env
npm run dev --workspace=worker
```

Several workers may run against one queue simultaneously — a local one and the compose one,
say. BullMQ's `wait -> active` move is an atomic Lua script against single-threaded Redis,
so a job is leased exactly once.

## Why plain Node, not Nest

Nest's value is HTTP: controllers, guards, pipes, the request lifecycle. This process has no
HTTP surface at all, and a DI container buys nothing for five objects wired once at boot
(`src/main.ts` is the whole composition root). What *does* carry over from `apps/api`,
because it earns its keep: a class-validator env class that fails at boot, and the adapter
pattern keeping the AWS SDK behind `storage/s3-object-storage.ts`.

## Boot sequence

Everything that can be wrong is checked before a single job is leased, because a worker that
starts and then fails every job is worse than one that refuses to start: validate env →
assert the ffmpeg version → parse `RENDITION_LADDER` → assert `WORK_DIR` is writable → start
the queue consumer → install `SIGTERM`/`SIGINT` handlers that drain in-flight jobs.

## Determinism, honestly

Same ffmpeg version, same flags and same ladder give *comparable* renditions — not identical
bytes. x264's slice decisions vary with thread count, which varies with host core count, so
byte-reproducibility would need `-threads 1` and cripple throughput. Tests therefore assert
on ffprobe metadata (codec, profile, resolution, segment count, duration), never checksums.

For the same reason `HWACCEL` defaults to `none`: NVENC output differs visibly from libx264
at the same bitrate, so a mixed GPU/CPU fleet would make one library inconsistent. Turn it
on only for a homogeneous fleet.
