import { validateWorkerEnv } from './env.validation';

const VALID = {
  REDIS_URL: 'redis://localhost:6379',
  TRANSCODE_QUEUE_NAME: 'transcode',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_REGION: 'us-east-1',
  S3_ACCESS_KEY_ID: 'smartteacher',
  S3_SECRET_ACCESS_KEY: 'smartteacher',
  S3_INGEST_BUCKET: 'ingest-bucket',
  S3_FORCE_PATH_STYLE: 'true',
  CALLBACK_URL: 'http://localhost:4000/internal/transcode/callback',
  WORKER_CALLBACK_SECRET: 'a'.repeat(32),
  CONCURRENCY: '2',
  RENDITION_LADDER: '360p:360:800k:96k,720p:720:2500k:128k',
  HWACCEL: 'none',
  WORK_DIR: '/tmp/transcode',
  EXPECTED_FFMPEG_VERSION: '7.0.2',
};

describe('validateWorkerEnv', () => {
  it('accepts a complete environment and coerces numbers', () => {
    const env = validateWorkerEnv({ ...VALID });

    expect(env.CONCURRENCY).toBe(2);
    expect(typeof env.CONCURRENCY).toBe('number');
  });

  // The same trap the API's copy documents: enableImplicitConversion turns the non-empty
  // string "false" into `true`, and MinIO would then be handed virtual-hosted URLs.
  it('reads S3_FORCE_PATH_STYLE=false as boolean false', () => {
    expect(validateWorkerEnv({ ...VALID, S3_FORCE_PATH_STYLE: 'false' }).S3_FORCE_PATH_STYLE).toBe(
      false,
    );
  });

  it.each(Object.keys(VALID))('throws naming %s when it is missing', (key) => {
    const incomplete = { ...VALID } as Record<string, unknown>;
    delete incomplete[key];

    expect(() => validateWorkerEnv(incomplete)).toThrow(new RegExp(key));
  });

  // A worker started with three missing vars should not take three restarts to find out.
  it('reports every missing variable at once', () => {
    const incomplete = { ...VALID } as Record<string, unknown>;
    delete incomplete.REDIS_URL;
    delete incomplete.CALLBACK_URL;

    expect(() => validateWorkerEnv(incomplete)).toThrow(/REDIS_URL[\s\S]*CALLBACK_URL/);
  });

  // This one value is what stands between an unauthenticated caller and flipping any video
  // to READY.
  it('rejects a callback secret shorter than 32 characters', () => {
    expect(() => validateWorkerEnv({ ...VALID, WORKER_CALLBACK_SECRET: 'short' })).toThrow(
      /WORKER_CALLBACK_SECRET/,
    );
  });

  it('rejects an unknown hardware acceleration mode', () => {
    expect(() => validateWorkerEnv({ ...VALID, HWACCEL: 'quicksync' })).toThrow(/HWACCEL/);
  });

  it('rejects a concurrency outside 1-16', () => {
    expect(() => validateWorkerEnv({ ...VALID, CONCURRENCY: '0' })).toThrow(/CONCURRENCY/);
    expect(() => validateWorkerEnv({ ...VALID, CONCURRENCY: '99' })).toThrow(/CONCURRENCY/);
  });

  // Two absences that are security properties, not oversights: results travel over the
  // signed callback rather than a direct write, so a compromised laptop worker holds no
  // database credential, and it never presigns for a browser so it needs no public
  // endpoint. Asserting they are not *required* is what pins that down — plainToInstance
  // copies unknown keys through, so their presence on the instance proves nothing.
  it.each(['DATABASE_URL', 'S3_PUBLIC_ENDPOINT'])('does not require %s', (key) => {
    expect(() => validateWorkerEnv({ ...VALID })).not.toThrow();
    expect(Object.keys(VALID)).not.toContain(key);
  });
});
