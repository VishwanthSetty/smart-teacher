import { classifyFfmpegFailure } from './ffmpeg-error';

describe('classifyFfmpegFailure', () => {
  it.each([
    ['a corrupt container', '[mov,mp4] moov atom not found\nInvalid data found when processing input'],
    ['an unsupported codec', 'Unknown encoder ' + "'prores'"],
    ['a source with no video', 'Output file #0 does not contain any stream'],
  ])('treats %s as terminal, so the job is not retried', (_label, stderr) => {
    const failure = classifyFfmpegFailure(stderr);
    expect(failure.terminal).toBe(true);
    expect(failure.reason).not.toContain('atom');
  });

  it.each([
    ['a full disk', 'av_interleaved_write_frame(): No space left on device'],
    ['a lost connection', 'Connection reset by peer'],
  ])('treats %s as retryable, since the input is fine', (_label, stderr) => {
    expect(classifyFfmpegFailure(stderr).terminal).toBe(false);
  });

  it('gives a corrupt source a reason that names the user\'s problem', () => {
    expect(classifyFfmpegFailure('Invalid data found when processing input').reason).toBe(
      'The uploaded file is corrupt or is not a readable video.',
    );
  });

  // An unclassifiable error on one specific file is far more often that file than a
  // transient condition, and a job that cannot be classified must not cycle forever.
  it('falls back to terminal with the last meaningful line', () => {
    const failure = classifyFfmpegFailure('frame= 100 fps=25\nsize= 1024kB\nSomething went sideways');
    expect(failure.terminal).toBe(true);
    expect(failure.reason).toBe('Something went sideways');
  });

  // failureReason is shown in the admin UI; a presigned URL there would be a working
  // capability handed to whoever reads it.
  it('strips URLs out of the fallback reason', () => {
    const failure = classifyFfmpegFailure(
      'https://bucket.example.com/vid/source.mp4?X-Amz-Signature=deadbeef: Server returned 403',
    );
    expect(failure.reason).not.toContain('X-Amz-Signature');
    expect(failure.reason).toContain('[url]');
  });

  it('never exceeds the column the reason is stored in', () => {
    const failure = classifyFfmpegFailure('x'.repeat(5000));
    expect(failure.reason.length).toBeLessThanOrEqual(500);
  });

  it('produces something usable for empty stderr', () => {
    expect(classifyFfmpegFailure('').reason).toBeTruthy();
  });
});
