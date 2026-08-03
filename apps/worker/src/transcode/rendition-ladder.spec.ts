import { parseRenditionLadder } from './rendition-ladder';

const V1_LADDER = '360p:360:800k:96k,720p:720:2500k:128k';

describe('parseRenditionLadder', () => {
  it('parses the v1 two-rung ladder', () => {
    expect(parseRenditionLadder(V1_LADDER)).toEqual([
      { name: '360p', height: 360, videoBitrate: '800k', audioBitrate: '96k', bitrateKbps: 800 },
      { name: '720p', height: 720, videoBitrate: '2500k', audioBitrate: '128k', bitrateKbps: 2500 },
    ]);
  });

  it('tolerates whitespace around entries', () => {
    expect(parseRenditionLadder(' 360p:360:800k:96k , 720p:720:2500k:128k ')).toHaveLength(2);
  });

  it('accepts a single rung', () => {
    expect(parseRenditionLadder('720p:720:2500k:128k')).toHaveLength(1);
  });

  // Widening the ladder must be config, not code.
  it('accepts the full four-rung ladder unchanged', () => {
    const ladder = parseRenditionLadder(
      '240p:240:400k:64k,360p:360:800k:96k,480p:480:1400k:128k,720p:720:2500k:128k',
    );
    expect(ladder.map((r) => r.name)).toEqual(['240p', '360p', '480p', '720p']);
  });

  it.each([
    ['empty', ''],
    ['only separators', ' , , '],
    ['missing a field', '360p:360:800k'],
    ['a non-numeric height', '360p:tall:800k:96k'],
    ['a bitrate without the k suffix', '360p:360:800:96k'],
  ])('rejects %s', (_label, raw) => {
    expect(() => parseRenditionLadder(raw)).toThrow();
  });

  // h264 with yuv420p cannot encode odd dimensions, and scale=-2 only guarantees the
  // width — the declared height has to be even on its own.
  it('rejects an odd height', () => {
    expect(() => parseRenditionLadder('361p:361:800k:96k')).toThrow(/odd height/);
  });

  it('rejects a height outside 16-4320', () => {
    expect(() => parseRenditionLadder('tiny:10:800k:96k')).toThrow();
    expect(() => parseRenditionLadder('huge:8640:800k:96k')).toThrow();
  });

  // Each name becomes an output directory and a VideoRendition unique key.
  it('rejects duplicate names', () => {
    expect(() => parseRenditionLadder('360p:360:800k:96k,360p:720:2500k:128k')).toThrow(/duplicate/);
  });

  // var_stream_map order is the order a player walks the master playlist.
  it('rejects a ladder that does not ascend by video bitrate', () => {
    expect(() => parseRenditionLadder('720p:720:2500k:128k,360p:360:800k:96k')).toThrow(/ascend/);
    expect(() => parseRenditionLadder('a:360:800k:96k,b:720:800k:128k')).toThrow(/ascend/);
  });
});
