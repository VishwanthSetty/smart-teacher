import { describe, expect, it } from 'vitest';
import { playbackKey } from '../src/keys';

describe('playbackKey', () => {
  it.each([
    '/videos/video-a/master.m3u8',
    '/videos/video-a/poster.jpg',
    '/videos/video-a/360p/playlist.m3u8',
    '/videos/video-a/360p/segment_001.ts',
  ])('accepts %s', (path) => expect(playbackKey(path)).not.toBeNull());

  it.each(['/secret', '/videos/video-a/../secret', '/videos/video-a/360p/anything.mp4'])(
    'rejects %s',
    (path) => expect(playbackKey(path)).toBeNull(),
  );
});
