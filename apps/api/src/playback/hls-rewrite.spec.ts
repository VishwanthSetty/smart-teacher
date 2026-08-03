import { rewriteHlsManifest } from './hls-rewrite';

describe('rewriteHlsManifest', () => {
  it('rewrites URI lines and URI attributes without changing other tags', () => {
    const input = '#EXTM3U\r\n#EXT-X-MAP:URI="init.mp4",BYTERANGE="10@0"\r\n#EXTINF:6,\r\nsegment_000.ts\r\n#EXT-X-BYTERANGE:10@0\r\n';
    expect(rewriteHlsManifest(input, (uri) => `R:${uri}`)).toBe(
      '#EXTM3U\n#EXT-X-MAP:URI="R:init.mp4",BYTERANGE="10@0"\n#EXTINF:6,\nR:segment_000.ts\n#EXT-X-BYTERANGE:10@0\n',
    );
  });
});
