import { masterUri, segmentKey, variantUri } from './playback-keys';

describe('playback keys', () => {
  it('derives only worker-shaped keys', () => {
    expect(masterUri('360p/playlist.m3u8', new Set(['360p']))).toBe('360p/playlist.m3u8');
    expect(variantUri('segment_001.ts', '360p')).toBe('segment_001.ts');
    expect(segmentKey('video-1', '360p', 'segment_001.ts')).toBe('videos/video-1/360p/segment_001.ts');
  });

  it.each(['../playlist.m3u8', 'https://bucket/360p/playlist.m3u8', '720p/playlist.m3u8'])(
    'rejects unsafe or unknown master URI %s',
    (uri) => expect(() => masterUri(uri, new Set(['360p']))).toThrow(),
  );

  it.each(['../secret', 'https://bucket/segment_001.ts', 'other.ts'])(
    'rejects unsafe segment %s',
    (segment) => expect(() => segmentKey('video-1', '360p', segment)).toThrow(),
  );
});
