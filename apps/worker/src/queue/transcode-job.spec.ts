import { narrowTranscodeJob } from './transcode-job';

const VALID = { videoId: 'vid_1', sourceKey: 'vid_1/source.mp4', attempt: 3 };

describe('narrowTranscodeJob', () => {
  it('accepts a well-formed payload', () => {
    expect(narrowTranscodeJob({ ...VALID })).toEqual(VALID);
  });

  it('drops fields the pipeline does not use', () => {
    expect(narrowTranscodeJob({ ...VALID, legacy: 'ignored' })).toEqual(VALID);
  });

  it.each([
    ['null', null],
    ['a string', 'not-a-job'],
    ['an empty object', {}],
  ])('rejects %s', (_label, data) => {
    expect(() => narrowTranscodeJob(data)).toThrow();
  });

  it.each(['videoId', 'sourceKey', 'attempt'])('rejects a payload missing %s', (key) => {
    const partial = { ...VALID } as Record<string, unknown>;
    delete partial[key];
    expect(() => narrowTranscodeJob(partial)).toThrow(new RegExp(key));
  });

  // The fencing token is what makes a stale callback detectable; a zero or fractional
  // value would never match a row's transcodeAttempts and would fail far less legibly.
  it.each([0, -1, 1.5, '2'])('rejects an invalid attempt token: %p', (attempt) => {
    expect(() => narrowTranscodeJob({ ...VALID, attempt })).toThrow(/attempt/);
  });
});
