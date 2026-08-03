import { parseMasterPlaylistDimensions } from './hls-master';

describe('parseMasterPlaylistDimensions', () => {
  it('associates each measured resolution with its variant playlist', () => {
    const playlist = `#EXTM3U
#EXT-X-VERSION:6
#EXT-X-STREAM-INF:BANDWIDTH=985600,RESOLUTION=640x360,CODECS="avc1.4d401e,mp4a.40.2"
360p/playlist.m3u8
#EXT-X-STREAM-INF:RESOLUTION=1280x720,BANDWIDTH=2890800
720p/playlist.m3u8
`;

    const dimensions = parseMasterPlaylistDimensions(playlist);

    expect(dimensions.get('360p/playlist.m3u8')).toEqual({ width: 640, height: 360 });
    expect(dimensions.get('720p/playlist.m3u8')).toEqual({ width: 1280, height: 720 });
  });

  it('rejects a variant without measured dimensions', () => {
    expect(() =>
      parseMasterPlaylistDimensions('#EXT-X-STREAM-INF:BANDWIDTH=985600\n360p/playlist.m3u8'),
    ).toThrow(/without a resolution/);
  });

  it('rejects a variant without a playlist URI', () => {
    expect(() =>
      parseMasterPlaylistDimensions('#EXT-X-STREAM-INF:RESOLUTION=640x360\n#EXT-X-ENDLIST'),
    ).toThrow(/without a playlist URI/);
  });
});
