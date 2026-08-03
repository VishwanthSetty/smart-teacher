import { ConfigService } from '@nestjs/config';
import { VideoStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TranscodeReconcilerService } from './transcode-reconciler.service';

const STALE_AFTER_MINS = 45;

describe('TranscodeReconcilerService', () => {
  let updateMany: jest.Mock;
  let service: TranscodeReconcilerService;

  beforeEach(() => {
    updateMany = jest.fn().mockResolvedValue({ count: 0 });
    const prisma = { video: { updateMany } } as unknown as PrismaService;
    const config = {
      getOrThrow: jest.fn().mockReturnValue(STALE_AFTER_MINS),
    } as unknown as ConfigService;
    service = new TranscodeReconcilerService(prisma, config);
  });

  it('fails only videos that are still QUEUED or PROCESSING', async () => {
    await service.sweepStale();

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: [VideoStatus.QUEUED, VideoStatus.PROCESSING] },
        }),
        data: {
          status: VideoStatus.FAILED,
          failureReason: 'Transcoding did not complete in time',
        },
      }),
    );
  });

  // updatedAt, not createdAt: a job re-queued after a stall must not inherit the original
  // attempt's clock and get failed while a worker is actively running it.
  it('cuts off on updatedAt, TRANSCODE_STALE_AFTER_MINS in the past', async () => {
    const before = Date.now();
    await service.sweepStale();
    const after = Date.now();

    const { updatedAt } = updateMany.mock.calls[0][0].where;
    const cutoff = (updatedAt.lt as Date).getTime();

    expect(cutoff).toBeGreaterThanOrEqual(before - STALE_AFTER_MINS * 60_000);
    expect(cutoff).toBeLessThanOrEqual(after - STALE_AFTER_MINS * 60_000);
  });

  it('reports how many rows it swept', async () => {
    updateMany.mockResolvedValue({ count: 3 });
    await expect(service.sweepStale()).resolves.toBe(3);
  });

  // updateMany over a read-then-write loop is what makes two requests racing the sweep
  // harmless — there is no row-by-row window for them to interleave in.
  it('sweeps in a single statement', async () => {
    await service.sweepStale();
    expect(updateMany).toHaveBeenCalledTimes(1);
  });
});
