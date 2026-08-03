import { plainToInstance, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsString,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

// Hardware encoders are opt-in and fleet-wide, never per-machine: NVENC output differs
// visibly from libx264 at the same bitrate, so a GPU cloud worker and a CPU laptop worker
// on one queue would produce inconsistent renditions for the same library. videotoolbox
// is macOS-only and unavailable inside a Linux container — it applies only when running
// the worker natively.
export const HWACCEL_MODES = ['none', 'nvenc', 'videotoolbox'] as const;
export type HwaccelMode = (typeof HWACCEL_MODES)[number];

/**
 * The worker's environment contract.
 *
 * Mirrors the shape of apps/api/src/config/env.validation.ts deliberately — same
 * class-validator approach, same fail-at-boot posture — but the two lists are disjoint on
 * purpose. Two absences here are security properties worth stating:
 *
 *   - No DATABASE_URL. Results travel over the signed HTTP callback, never a direct write,
 *     so a compromised laptop worker holds no database credential.
 *   - No S3_PUBLIC_ENDPOINT. The worker never presigns for a browser, so it needs one S3
 *     client where the API needs two.
 */
export class WorkerEnvironment {
  @IsString()
  REDIS_URL!: string;

  // Must match the API's TRANSCODE_QUEUE_NAME. A mismatch is silent: jobs pile up in a
  // queue nobody reads, and nothing logs an error on either side.
  @IsString()
  TRANSCODE_QUEUE_NAME!: string;

  @IsString()
  S3_ENDPOINT!: string;

  @IsString()
  S3_REGION!: string;

  @IsString()
  S3_ACCESS_KEY_ID!: string;

  @IsString()
  S3_SECRET_ACCESS_KEY!: string;

  @IsString()
  S3_INGEST_BUCKET!: string;

  // Read off `obj`, the raw source, not `value`. enableImplicitConversion coerces the
  // string "false" to `true` (a non-empty string) *before* this transform runs, so a
  // transform reading `value` would be handed that `true` and faithfully return it —
  // silently forcing path-style addressing on every deployment, including real S3.
  @Transform(({ obj }) => obj.S3_FORCE_PATH_STYLE === 'true' || obj.S3_FORCE_PATH_STYLE === true)
  @IsBoolean()
  S3_FORCE_PATH_STYLE!: boolean;

  @IsString()
  CALLBACK_URL!: string;

  @IsString()
  @MinLength(32)
  WORKER_CALLBACK_SECRET!: string;

  // Capped low by default. Every concurrent job shares one Node event loop, and BullMQ
  // renews its job locks on that same loop — so one blocking operation endangers every
  // in-flight lease, not just its own.
  @IsInt()
  @Min(1)
  @Max(16)
  CONCURRENCY!: number;

  // "name:height:videoBitrate:audioBitrate", comma separated. Parsed and validated at boot
  // by rendition-ladder.ts so a malformed ladder fails immediately rather than mid-job.
  @IsString()
  RENDITION_LADDER!: string;

  @IsIn(HWACCEL_MODES)
  HWACCEL!: HwaccelMode;

  @IsString()
  WORK_DIR!: string;

  // Asserted against the actual binary at boot. This is what makes "local and cloud
  // produce comparable output" enforceable rather than aspirational — a developer running
  // natively against a Homebrew ffmpeg cannot silently encode a different ladder.
  @IsString()
  EXPECTED_FFMPEG_VERSION!: string;
}

export function validateWorkerEnv(config: Record<string, unknown>): WorkerEnvironment {
  const validated = plainToInstance(WorkerEnvironment, config, {
    enableImplicitConversion: true,
    excludeExtraneousValues: false,
  });
  const errors = validateSync(validated, { skipMissingProperties: false, whitelist: false });

  if (errors.length > 0) {
    // Every offending variable at once: a worker started with three missing vars should
    // not take three restarts to discover that.
    const detail = errors.map((error) => `  ${error.property}: ${Object.values(error.constraints ?? {}).join(', ')}`);
    throw new Error(`Worker environment validation failed:\n${detail.join('\n')}`);
  }

  return validated;
}
