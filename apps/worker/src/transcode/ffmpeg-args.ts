import { HwaccelMode } from '../config/env.validation';
import { Rendition } from './rendition-ladder';

export interface SourceProbe {
  durationSecs: number;
  hasAudio: boolean;
}

export interface HlsPaths {
  /** The downloaded source file. */
  input: string;
  /** Directory the variant folders and master.m3u8 are written into. */
  outputDir: string;
}

// Six-second segments: long enough that segment count stays sane for a 40-minute lesson,
// short enough that a client stuck on a bad rung recovers within a few seconds.
const SEGMENT_SECS = 6;
// Keyframes every two seconds, so segment boundaries line up across renditions. Without
// aligned boundaries a player cannot switch rungs cleanly, which is the whole point.
const KEYFRAME_INTERVAL_SECS = 2;

const VIDEO_ENCODERS: Record<HwaccelMode, string> = {
  none: 'libx264',
  nvenc: 'h264_nvenc',
  videotoolbox: 'h264_videotoolbox',
};

/**
 * Builds the single ffmpeg invocation that produces the whole ladder plus master.m3u8.
 *
 * One invocation rather than one per rung: the source is decoded once and split, which on
 * a 2 GB lesson is most of the wall-clock saving available.
 */
export function buildHlsArgs(
  ladder: Rendition[],
  probe: SourceProbe,
  paths: HlsPaths,
  hwaccel: HwaccelMode,
  threads: number,
): string[] {
  const encoder = VIDEO_ENCODERS[hwaccel];

  const args = [
    '-hide_banner',
    // Mandatory when spawning: without it ffmpeg consumes the parent process's stdin.
    '-nostdin',
    '-y',
    // Structured key=value progress on stdout instead of parsing full stderr. Cheap to
    // read, which matters because this runs on the same event loop that renews the job
    // lock — expensive parsing there can let a healthy job's lock expire.
    '-progress',
    'pipe:1',
    '-nostats',
    '-i',
    paths.input,
  ];

  // A source with no audio stream makes `-map a:0` fail outright. Silent classroom
  // footage is common, so synthesise a track rather than producing renditions whose audio
  // mapping differs from every other video in the library.
  if (!probe.hasAudio) {
    args.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000', '-shortest');
  }

  args.push('-filter_complex', buildFilterComplex(ladder));

  const audioInput = probe.hasAudio ? 'a:0' : '1:a';

  ladder.forEach((rendition, index) => {
    args.push('-map', `[v${index}out]`);
    args.push(`-c:v:${index}`, encoder);
    args.push(`-b:v:${index}`, rendition.videoBitrate);
    // Headroom over the target so a complex scene does not blow the segment budget, and a
    // buffer of 2x the target, which is the conventional VBV shape for VOD ABR.
    args.push(`-maxrate:v:${index}`, scaleBitrate(rendition.videoBitrate, 1.07));
    args.push(`-bufsize:v:${index}`, scaleBitrate(rendition.videoBitrate, 2));
  });

  ladder.forEach((rendition, index) => {
    args.push('-map', audioInput);
    args.push(`-c:a:${index}`, 'aac');
    args.push(`-b:a:${index}`, rendition.audioBitrate);
  });

  args.push(
    '-ac',
    '2',
    '-preset',
    'veryfast',
    '-profile:v',
    'main',
    '-pix_fmt',
    'yuv420p',
    // Deliberately no -crf. CRF and -b:v/-maxrate are contradictory instructions; a fixed
    // ABR ladder wants bitrate targeting only, however many tutorials show both.
    '-sc_threshold',
    '0',
    '-force_key_frames',
    `expr:gte(t,n_forced*${KEYFRAME_INTERVAL_SECS})`,
    // Not -r: forcing a frame rate would resample every source to one cadence. Keyframe
    // placement is expressed in seconds precisely so it holds at any source fps.
    '-threads',
    String(threads),
    '-hls_time',
    String(SEGMENT_SECS),
    '-hls_playlist_type',
    'vod',
    '-hls_flags',
    'independent_segments',
    '-hls_segment_type',
    'mpegts',
    '-hls_segment_filename',
    `${paths.outputDir}/%v/segment_%03d.ts`,
    '-master_pl_name',
    'master.m3u8',
    '-var_stream_map',
    // `name:`, not `name=`: the hls muxer parses each comma-separated entry as a
    // colon-delimited keyval and rejects the whole map with "Invalid keyval" on `=`.
    ladder.map((rendition, index) => `v:${index},a:${index},name:${rendition.name}`).join(' '),
    // %v expands to the name= value from var_stream_map, so output lands in
    // <outputDir>/360p/, <outputDir>/720p/, and master.m3u8 references them relatively.
    `${paths.outputDir}/%v/playlist.m3u8`,
  );

  return args;
}

/**
 * Poster frame, as its own cheap invocation.
 *
 * Kept separate from the ladder run so a poster failure never costs a re-encode.
 */
export function buildPosterArgs(input: string, durationSecs: number, outputPath: string): string[] {
  // -ss before -i is the fast seek. Half-duration for anything under six seconds, so a
  // short clip does not seek past its own end and produce nothing.
  const seek = Math.min(3, durationSecs / 2);

  return [
    '-hide_banner',
    '-nostdin',
    '-y',
    '-ss',
    seek.toFixed(3),
    '-i',
    input,
    '-frames:v',
    '1',
    '-vf',
    'scale=1280:-2',
    '-q:v',
    '3',
    outputPath,
  ];
}

function buildFilterComplex(ladder: Rendition[]): string {
  const split = `[0:v]split=${ladder.length}${ladder.map((_, i) => `[v${i}]`).join('')}`;
  const scales = ladder.map(
    (rendition, index) => `[v${index}]scale=w=-2:h=${rendition.height}[v${index}out]`,
  );
  return [split, ...scales].join(';');
}

function scaleBitrate(bitrate: string, factor: number): string {
  return `${Math.round(Number(bitrate.slice(0, -1)) * factor)}k`;
}
