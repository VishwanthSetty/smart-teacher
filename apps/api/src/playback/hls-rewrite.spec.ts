import { rewriteHlsManifest } from './hls-rewrite';

const MANIFEST_FIXTURE = '#EXTM3U\r\n#EXT-X-MAP:URI="init.mp4",BYTERANGE="10@0"\r\n#EXTINF:6,\r\nsegment_000.ts\r\n#EXT-X-BYTERANGE:10@0\r\n';
const REWRITTEN_FIXTURE = '#EXTM3U\n#EXT-X-MAP:URI="R:init.mp4",BYTERANGE="10@0"\n#EXTINF:6,\nR:segment_000.ts\n#EXT-X-BYTERANGE:10@0\n';

describe('rewriteHlsManifest', () => {
  it('matches the edge worker fixture byte-for-byte', () => {
    expect(rewriteHlsManifest(MANIFEST_FIXTURE, (uri) => `R:${uri}`)).toBe(REWRITTEN_FIXTURE);
  });
});
