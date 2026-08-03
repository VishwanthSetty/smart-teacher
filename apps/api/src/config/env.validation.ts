import { plainToInstance, Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsString, Max, Min, MinLength, validateSync } from 'class-validator';

class EnvironmentVariables {
  @IsInt()
  @Min(0)
  @Max(65535)
  PORT!: number;

  @IsString()
  CORS_ORIGIN!: string;

  @IsString()
  DATABASE_URL!: string;

  @IsString()
  JWT_ACCESS_SECRET!: string;

  @IsString()
  JWT_ACCESS_EXPIRY!: string;

  @IsString()
  JWT_REFRESH_SECRET!: string;

  @IsString()
  JWT_REFRESH_EXPIRY!: string;

  @IsString()
  WEB_APP_URL!: string;

  @IsString()
  SMTP_HOST!: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  SMTP_PORT!: number;

  @IsString()
  SMTP_USER!: string;

  @IsString()
  SMTP_PASS!: string;

  @IsString()
  MAIL_FROM_NAME!: string;

  @IsString()
  MAIL_FROM_ADDRESS!: string;

  // Object storage for video ingest. Points at MinIO locally and at real S3 in
  // production — the adapter is the same, only these values differ.
  //
  // Where *this process* reaches the bucket (http://minio:9000 under docker compose).
  @IsString()
  S3_ENDPOINT!: string;

  // Where the *browser* reaches the bucket. A presigned URL's signature covers the
  // host, so it must be signed against the origin that will actually PUT to it — the
  // api container's internal hostname would not resolve for the user's browser. Equal
  // to S3_ENDPOINT everywhere except docker compose.
  @IsString()
  S3_PUBLIC_ENDPOINT!: string;

  @IsString()
  S3_REGION!: string;

  @IsString()
  S3_ACCESS_KEY_ID!: string;

  @IsString()
  S3_SECRET_ACCESS_KEY!: string;

  @IsString()
  S3_INGEST_BUCKET!: string;

  // enableImplicitConversion coerces "false" to `true` (a non-empty string), so this
  // needs an explicit transform or MinIO would be handed virtual-hosted URLs it cannot
  // serve off localhost.
  //
  // Read off `obj`, the raw source, not `value`: the implicit conversion runs *before*
  // this transform, so a transform reading `value` is handed the already-coerced `true`
  // and faithfully returns it — forcing path-style addressing everywhere, real S3
  // included. Locally that is invisible, because path-style is what MinIO wants anyway.
  @Transform(({ obj }) => obj.S3_FORCE_PATH_STYLE === 'true' || obj.S3_FORCE_PATH_STYLE === true)
  @IsBoolean()
  S3_FORCE_PATH_STYLE!: boolean;

  // Kept short: the URL is a bearer capability for one object key, so its lifetime is
  // the window in which a leaked link is useful.
  @IsInt()
  @Min(60)
  @Max(3600)
  S3_UPLOAD_URL_EXPIRY_SECS!: number;

  @IsInt()
  @Min(60)
  @Max(3600)
  S3_DOWNLOAD_URL_EXPIRY_SECS: number = 300;

  @Transform(({ obj }) =>
    obj.RETAIN_INGEST_SOURCE === undefined
      ? true
      : obj.RETAIN_INGEST_SOURCE === 'true' || obj.RETAIN_INGEST_SOURCE === true,
  )
  @IsBoolean()
  RETAIN_INGEST_SOURCE: boolean = true;

  // Dedicated because playback tokens travel in URLs and therefore have a different
  // exposure boundary from API access tokens and worker callback signatures.
  @IsString()
  @MinLength(32)
  PLAYBACK_TOKEN_SECRET: string = 'dev-playback-token-secret-change-me-32-chars';

  @IsInt()
  @Min(900)
  @Max(43200)
  PLAYBACK_TOKEN_TTL_SECS: number = 14400;

  // Transcode pipeline. The API only *produces* jobs and receives callbacks; the worker
  // that consumes them is a separate process (apps/worker) with its own env class.
  //
  // Named REDIS_URL with no alias: two names for one setting is a silent-precedence bug
  // waiting for the day someone sets both.
  @IsString()
  REDIS_URL!: string;

  // Must match the worker's. A mismatch is silent — jobs pile up in a queue nobody reads.
  @IsString()
  TRANSCODE_QUEUE_NAME!: string;

  // HMAC key for POST /internal/transcode/callback. 32 chars minimum because this single
  // value is what stops an unauthenticated caller flipping any video to READY.
  @IsString()
  @MinLength(32)
  WORKER_CALLBACK_SECRET!: string;

  // How far a callback's signed timestamp may drift from ours. This is the replay window:
  // long enough to survive clock skew between a laptop and the server, short enough that a
  // captured request expires quickly.
  @IsInt()
  @Min(30)
  @Max(900)
  TRANSCODE_CALLBACK_SKEW_SECS!: number;

  // A video still QUEUED/PROCESSING this long after its last transition is presumed dead
  // and swept to FAILED. Must comfortably exceed the longest legitimate transcode — the
  // reconciler cannot tell "slow" from "gone".
  @IsInt()
  @Min(5)
  @Max(720)
  TRANSCODE_STALE_AFTER_MINS!: number;
}

export function validateEnv(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validatedConfig, { skipMissingProperties: false });

  if (errors.length > 0) {
    throw new Error(`Environment validation failed:\n${errors.toString()}`);
  }

  return validatedConfig;
}
