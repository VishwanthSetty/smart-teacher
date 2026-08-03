import { spawn } from 'node:child_process';

// stderr is kept for classification but bounded: ffmpeg can emit megabytes on a pathological
// input, and holding all of it would trade a transcode failure for an OOM.
const MAX_STDERR_BYTES = 64 * 1024;

export class FfmpegError extends Error {
  constructor(
    readonly exitCode: number | null,
    readonly stderr: string,
    readonly signal: NodeJS.Signals | null = null,
  ) {
    super(
      signal === null
        ? `ffmpeg exited with code ${exitCode ?? 'null'}`
        : `ffmpeg was terminated by signal ${signal}`,
    );
    this.name = 'FfmpegError';
  }
}

/**
 * Runs ffmpeg to completion.
 *
 * spawn, never exec or any synchronous variant. BullMQ renews this job's lock on a timer
 * running on the Node event loop: block that loop and the lock silently expires while
 * ffmpeg is still working, another worker leases the job, and two encoders write the same
 * object keys. Everything in this file exists to keep the loop free.
 */
export async function runFfmpeg(args: string[], onProgress?: (outTimeSecs: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';

    // -progress writes small key=value lines here. Parsing this rather than regexing full
    // stderr keeps the per-chunk cost negligible.
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      if (onProgress === undefined) {
        return;
      }
      for (const line of chunk.split('\n')) {
        if (line.startsWith('out_time_ms=')) {
          const microseconds = Number(line.slice('out_time_ms='.length).trim());
          if (Number.isFinite(microseconds)) {
            onProgress(microseconds / 1_000_000);
          }
        }
      }
    });

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      if (stderr.length < MAX_STDERR_BYTES) {
        stderr += chunk;
      }
    });

    child.on('error', (error) => reject(new FfmpegError(null, `${error.message}\n${stderr}`)));
    child.on('close', (code, signal) =>
      code === 0 ? resolve() : reject(new FfmpegError(code, stderr, signal)),
    );
  });
}

export interface ProbeResult {
  durationSecs: number;
  hasAudio: boolean;
  width: number;
  height: number;
}

/**
 * Reads a media file's shape.
 *
 * Run before encoding because two of these decide the command: a source with no audio
 * stream makes `-map a:0` fail outright, and the duration bounds where the poster frame
 * can be taken from.
 */
export async function runFfprobe(input: string): Promise<ProbeResult> {
  const raw = await runFfprobeJson(input);
  const parsed: unknown = JSON.parse(raw);

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error(`ffprobe returned no usable metadata for ${input}.`);
  }

  const { streams, format } = parsed as { streams?: unknown; format?: unknown };
  const streamList = Array.isArray(streams) ? (streams as Array<Record<string, unknown>>) : [];

  const video = streamList.find((stream) => stream.codec_type === 'video');
  if (video === undefined) {
    throw new Error('The file contains no video stream.');
  }

  const duration =
    typeof format === 'object' && format !== null
      ? Number((format as Record<string, unknown>).duration)
      : NaN;

  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error('The file reports no usable duration.');
  }

  return {
    durationSecs: Math.max(1, Math.round(duration)),
    hasAudio: streamList.some((stream) => stream.codec_type === 'audio'),
    width: Number(video.width) || 0,
    height: Number(video.height) || 0,
  };
}

function runFfprobeJson(input: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'ffprobe',
      [
        '-v',
        'error',
        '-show_entries',
        'stream=codec_type,width,height:format=duration',
        '-of',
        'json',
        input,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );

    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });

    child.on('error', (error) => reject(new FfmpegError(null, error.message)));
    child.on('close', (code, signal) =>
      code === 0 ? resolve(stdout) : reject(new FfmpegError(code, stderr, signal)),
    );
  });
}

/**
 * Refuses to start on a version mismatch.
 *
 * This is what makes "the identical image produces comparable output locally and in the
 * cloud" enforceable rather than aspirational. Without it a developer running the worker
 * natively against a Homebrew ffmpeg would silently produce a different ladder from the
 * container, and nothing would ever say so.
 *
 * Note the honest limit: x264 is not bit-reproducible across thread counts, so this buys
 * *comparable* output — same codec, profile, resolutions and segmentation — not identical
 * bytes. Byte-identical would need -threads 1, which would cripple throughput.
 */
export async function assertFfmpegVersion(expected: string): Promise<string> {
  const actual = await ffmpegVersion();

  if (!actual.startsWith(expected)) {
    throw new Error(
      `ffmpeg version mismatch: expected ${expected}, found ${actual}. ` +
        'Renditions would not match those produced by other workers on this queue.',
    );
  }

  return actual;
}

function ffmpegVersion(): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', ['-version'], { stdio: ['ignore', 'pipe', 'ignore'] });
    let stdout = '';

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });

    child.on('error', (error) =>
      reject(new Error(`ffmpeg is not on PATH or failed to run: ${error.message}`)),
    );
    child.on('close', () => {
      const match = /^ffmpeg version (\S+)/.exec(stdout);
      if (match === null) {
        reject(new Error('Could not read the ffmpeg version banner.'));
        return;
      }
      resolve(match[1]);
    });
  });
}
