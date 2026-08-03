const MAX_REASON_LENGTH = 500;

/**
 * Maps ffmpeg's stderr to a short reason a Super Admin can act on.
 *
 * Two rules drive everything here. Raw stderr never reaches the database: it is hundreds
 * of lines of build flags and stream metadata, and it can contain the signed source URL.
 * And the reason has to name the *user's* problem — "this file is not a video we can
 * read" — not ffmpeg's internal one.
 */
const PATTERNS: Array<{ match: RegExp; reason: string; terminal: boolean }> = [
  {
    match: /Invalid data found when processing input|moov atom not found|Format .* detected only with low score/i,
    reason: 'The uploaded file is corrupt or is not a readable video.',
    terminal: true,
  },
  {
    match: /Unknown encoder|Encoder .* not found|Decoder .* not found|Unsupported codec/i,
    reason: 'The video uses a codec this pipeline cannot process.',
    terminal: true,
  },
  {
    match: /does not contain any stream|Output file .* does not contain any stream/i,
    reason: 'The uploaded file contains no video stream.',
    terminal: true,
  },
  {
    match: /Invalid argument|Error initializing (output )?stream|height not divisible|width not divisible/i,
    reason: 'The video has dimensions or properties this pipeline cannot encode.',
    terminal: true,
  },
  {
    match: /No space left on device/i,
    reason: 'The worker ran out of disk space while transcoding.',
    terminal: false,
  },
  {
    match: /Connection refused|Connection reset|Temporary failure in name resolution|timed out/i,
    reason: 'The worker lost access to storage while transcoding.',
    terminal: false,
  },
];

export interface FfmpegFailure {
  reason: string;
  /**
   * Terminal means the input is the problem and retrying cannot help — report `failed`
   * and resolve the job. Retrying a corrupt file three times with exponential backoff is
   * pure waste and delays the admin's feedback by minutes.
   */
  terminal: boolean;
}

export function classifyFfmpegFailure(stderr: string): FfmpegFailure {
  for (const { match, reason, terminal } of PATTERNS) {
    if (match.test(stderr)) {
      return { reason, terminal };
    }
  }

  // Unrecognised: treated as terminal, because an unknown ffmpeg error on a specific file
  // is far more often that file than a transient condition, and a job that cannot be
  // classified must not cycle the queue forever.
  return { reason: truncate(sanitise(lastMeaningfulLine(stderr))), terminal: true };
}

function lastMeaningfulLine(stderr: string): string {
  const lines = stderr
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('frame=') && !line.startsWith('size='));

  return lines.at(-1) ?? 'Transcoding failed for an unknown reason.';
}

// Presigned URLs and bucket hosts can appear in ffmpeg's I/O errors; a failureReason is
// shown in the admin UI and would otherwise hand out a working capability.
function sanitise(line: string): string {
  return line.replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, '[url]');
}

function truncate(reason: string): string {
  return reason.length <= MAX_REASON_LENGTH ? reason : `${reason.slice(0, MAX_REASON_LENGTH - 1)}…`;
}
