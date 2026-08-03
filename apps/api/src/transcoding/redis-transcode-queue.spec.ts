import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { RedisTranscodeQueue } from './redis-transcode-queue';

jest.mock('bullmq');

const QUEUE_NAME = 'transcode';
const REDIS_URL = 'redis://localhost:6379';

describe('RedisTranscodeQueue', () => {
  let add: jest.Mock;
  let close: jest.Mock;
  let service: RedisTranscodeQueue;

  beforeEach(() => {
    jest.clearAllMocks();
    add = jest.fn().mockResolvedValue(undefined);
    close = jest.fn().mockResolvedValue(undefined);
    (Queue as unknown as jest.Mock).mockImplementation(() => ({ add, close }));

    const config = {
      getOrThrow: jest.fn((key: string) => (key === 'REDIS_URL' ? REDIS_URL : QUEUE_NAME)),
    } as unknown as ConfigService;
    service = new RedisTranscodeQueue(config);
    jest.spyOn(service['logger'], 'log').mockImplementation(() => undefined);
  });

  /**
   * The load-bearing test in this file. Every e2e spec builds the whole AppModule; an
   * eager connection in the constructor would make all of them depend on a running Redis
   * and hang the suite on ioredis's infinite retry.
   */
  it('opens no connection until the first enqueue', async () => {
    expect(Queue).not.toHaveBeenCalled();

    await service.enqueue({ videoId: 'vid_1', sourceKey: 'vid_1/source.mp4', attempt: 1 });

    expect(Queue).toHaveBeenCalledTimes(1);
  });

  it('reuses one queue across enqueues', async () => {
    await service.enqueue({ videoId: 'vid_1', sourceKey: 'vid_1/source.mp4', attempt: 1 });
    await service.enqueue({ videoId: 'vid_2', sourceKey: 'vid_2/source.mp4', attempt: 1 });

    expect(Queue).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledTimes(2);
  });

  it('connects to the configured queue with maxRetriesPerRequest disabled', async () => {
    await service.enqueue({ videoId: 'vid_1', sourceKey: 'vid_1/source.mp4', attempt: 1 });

    expect(Queue).toHaveBeenCalledWith(
      QUEUE_NAME,
      expect.objectContaining({
        connection: expect.objectContaining({ url: REDIS_URL, maxRetriesPerRequest: null }),
      }),
    );
  });

  // Per attempt, not per video: a bare videoId jobId would dedupe the retry route's
  // deliberate re-enqueue into a silent no-op.
  it('keys the job by videoId and attempt', async () => {
    await service.enqueue({ videoId: 'vid_1', sourceKey: 'vid_1/source.mp4', attempt: 4 });

    expect(add).toHaveBeenCalledWith(
      'transcode',
      { videoId: 'vid_1', sourceKey: 'vid_1/source.mp4', attempt: 4 },
      expect.objectContaining({ jobId: 'vid_1-4' }),
    );
  });

  // BullMQ rejects a custom id containing a colon outright — it is Redis's key separator —
  // and because enqueue failures are deliberately swallowed by VideosService, getting this
  // wrong is silent: every video sits in QUEUED until the reconciler fails it.
  it('never puts a colon in the job id', async () => {
    await service.enqueue({ videoId: 'vid_1', sourceKey: 'vid_1/source.mp4', attempt: 4 });

    const { jobId } = add.mock.calls[0][2];
    expect(jobId).not.toContain(':');
  });

  it('sets bounded retention and exponential backoff', async () => {
    await service.enqueue({ videoId: 'vid_1', sourceKey: 'vid_1/source.mp4', attempt: 1 });

    expect(add).toHaveBeenCalledWith(
      'transcode',
      expect.anything(),
      expect.objectContaining({
        attempts: 3,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: { age: 86_400, count: 1_000 },
        removeOnFail: { age: 604_800 },
      }),
    );
  });

  it('closes the connection on shutdown', async () => {
    await service.enqueue({ videoId: 'vid_1', sourceKey: 'vid_1/source.mp4', attempt: 1 });
    await service.onModuleDestroy();

    expect(close).toHaveBeenCalled();
  });

  it('is a no-op on shutdown when nothing was ever enqueued', async () => {
    await expect(service.onModuleDestroy()).resolves.toBeUndefined();
    expect(close).not.toHaveBeenCalled();
  });
});
