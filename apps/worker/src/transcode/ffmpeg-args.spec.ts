import { buildHlsArgs, buildPosterArgs } from './ffmpeg-args';
import { parseRenditionLadder } from './rendition-ladder';

const PATHS = { input: '/work/source.mp4', outputDir: '/work/out' };
const WITH_AUDIO = { durationSecs: 612, hasAudio: true };
const V1_LADDER = parseRenditionLadder('360p:360:800k:96k,720p:720:2500k:128k');

describe('buildHlsArgs', () => {
  /**
   * The golden arg array. Every flag here was chosen for a reason recorded in
   * ffmpeg-args.ts, and a silent change to any of them alters what a school sees without
   * failing anything else — so the whole command is pinned.
   */
  it('produces the exact command for the v1 two-rung ladder', () => {
    expect(buildHlsArgs(V1_LADDER, WITH_AUDIO, PATHS, 'none', 4)).toEqual([
      '-hide_banner',
      '-nostdin',
      '-y',
      '-progress',
      'pipe:1',
      '-nostats',
      '-i',
      '/work/source.mp4',
      '-filter_complex',
      '[0:v]split=2[v0][v1];[v0]scale=w=-2:h=360[v0out];[v1]scale=w=-2:h=720[v1out]',
      '-map',
      '[v0out]',
      '-c:v:0',
      'libx264',
      '-b:v:0',
      '800k',
      '-maxrate:v:0',
      '856k',
      '-bufsize:v:0',
      '1600k',
      '-map',
      '[v1out]',
      '-c:v:1',
      'libx264',
      '-b:v:1',
      '2500k',
      '-maxrate:v:1',
      '2675k',
      '-bufsize:v:1',
      '5000k',
      '-map',
      'a:0',
      '-c:a:0',
      'aac',
      '-b:a:0',
      '96k',
      '-map',
      'a:0',
      '-c:a:1',
      'aac',
      '-b:a:1',
      '128k',
      '-ac',
      '2',
      '-preset',
      'veryfast',
      '-profile:v',
      'main',
      '-pix_fmt',
      'yuv420p',
      '-sc_threshold',
      '0',
      '-force_key_frames',
      'expr:gte(t,n_forced*2)',
      '-threads',
      '4',
      '-hls_time',
      '6',
      '-hls_playlist_type',
      'vod',
      '-hls_flags',
      'independent_segments',
      '-hls_segment_type',
      'mpegts',
      '-hls_segment_filename',
      '/work/out/%v/segment_%03d.ts',
      '-master_pl_name',
      'master.m3u8',
      '-var_stream_map',
      'v:0,a:0,name:360p v:1,a:1,name:720p',
      '/work/out/%v/playlist.m3u8',
    ]);
  });

  // The machine-checkable proof of "widening the ladder is config, not code": a third rung
  // changes only generated arguments.
  it('scales to a three-rung ladder with no code change', () => {
    const args = buildHlsArgs(
      parseRenditionLadder('360p:360:800k:96k,480p:480:1400k:128k,720p:720:2500k:128k'),
      WITH_AUDIO,
      PATHS,
      'none',
      4,
    );

    expect(args).toContain('[0:v]split=3[v0][v1][v2];[v0]scale=w=-2:h=360[v0out];[v1]scale=w=-2:h=480[v1out];[v2]scale=w=-2:h=720[v2out]');
    expect(args).toContain('v:0,a:0,name:360p v:1,a:1,name:480p v:2,a:2,name:720p');
    expect(args).toContain('-b:v:2');
  });

  // A source with no audio makes `-map a:0` fail outright, and silent classroom footage is
  // common. Synthesising a track keeps every rendition's mapping consistent.
  it('synthesises a silent track when the source has no audio', () => {
    const args = buildHlsArgs(V1_LADDER, { durationSecs: 612, hasAudio: false }, PATHS, 'none', 4);

    expect(args).toContain('anullsrc=channel_layout=stereo:sample_rate=48000');
    expect(args).toContain('-shortest');
    expect(args).toContain('1:a');
    expect(args).not.toContain('a:0');
  });

  // CRF and -b:v/-maxrate are contradictory instructions; a fixed ABR ladder wants
  // bitrate targeting only.
  it('never emits -crf', () => {
    expect(buildHlsArgs(V1_LADDER, WITH_AUDIO, PATHS, 'none', 4)).not.toContain('-crf');
  });

  // Forcing -r would resample every source to one cadence. Keyframes are expressed in
  // seconds so alignment holds at any source frame rate.
  it('places keyframes by time rather than forcing a frame rate', () => {
    const args = buildHlsArgs(V1_LADDER, WITH_AUDIO, PATHS, 'none', 4);
    expect(args).toContain('expr:gte(t,n_forced*2)');
    expect(args).not.toContain('-r');
    expect(args).not.toContain('-g');
  });

  it.each([
    ['nvenc', 'h264_nvenc'],
    ['videotoolbox', 'h264_videotoolbox'],
  ] as const)('uses the %s encoder when hardware acceleration is enabled', (mode, encoder) => {
    const args = buildHlsArgs(V1_LADDER, WITH_AUDIO, PATHS, mode, 4);
    expect(args).toContain(encoder);
    expect(args).not.toContain('libx264');
  });
});

describe('buildPosterArgs', () => {
  it('fast-seeks before the input and grabs a single frame', () => {
    const args = buildPosterArgs('/work/source.mp4', 612, '/work/out/poster.jpg');

    expect(args.indexOf('-ss')).toBeLessThan(args.indexOf('-i'));
    expect(args).toContain('3.000');
    expect(args).toContain('-frames:v');
    expect(args).toContain('/work/out/poster.jpg');
  });

  // A two-second clip seeked to 3s produces nothing at all.
  it('never seeks past the end of a very short source', () => {
    expect(buildPosterArgs('/work/source.mp4', 2, '/work/out/poster.jpg')).toContain('1.000');
  });
});
