import type { ConfigService } from '@nestjs/config';
import { ProgressStatus, ResourceType } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import type { DocumentsService } from '../documents/documents.service';
import type { ActorContentScopeService } from '../entitlements/actor-content-scope.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { TasksService } from '../tasks/tasks.service';
import type { VideosService } from '../videos/videos.service';
import { ProgressService } from './progress.service';

const VIDEO_ID = 'video-1';
const DURATION_SECS = 100;
const actor = { sub: 'student-1', schoolId: 'school-1' } as AuthenticatedUser;

interface Row {
  status: ProgressStatus;
  percent: number;
  coveredSecs: number;
  watchedIntervals: number[][];
  completedAt: Date | null;
  updatedAt: Date;
}

function build(completionPercent = 85) {
  let stored: Row | null = null;
  const tx = {
    resourceActivity: {
      findUnique: jest.fn(async () => stored),
      upsert: jest.fn(async ({ create }: { create: Omit<Row, 'updatedAt'> }) => {
        stored = { ...create, updatedAt: stored?.updatedAt ?? new Date() };
        return stored;
      }),
    },
  };
  const tasks = { syncForResource: jest.fn(async () => undefined) };
  const settings: Record<string, number> = {
    VIDEO_COMPLETION_PERCENT: completionPercent,
    MAX_PLAYBACK_RATE: 2,
    PROGRESS_CLOCK_SLACK_SECS: 10,
  };
  const service = new ProgressService(
    { $transaction: jest.fn((operation: (client: typeof tx) => unknown) => operation(tx)) } as unknown as PrismaService,
    { getOrThrow: (key: string) => settings[key] } as unknown as ConfigService,
    { findPlayableVisibleTo: jest.fn(async () => ({ durationSecs: DURATION_SECS })) } as unknown as VideosService,
    {} as unknown as DocumentsService,
    {} as unknown as ActorContentScopeService,
    tasks as unknown as TasksService,
  );
  const beat = (intervals: number[][]) =>
    service.updateVideo(
      VIDEO_ID,
      { positionSecs: intervals.at(-1)?.[1] ?? 0, intervals, clientUpdatedAt: new Date().toISOString() },
      actor,
    );
  // Ages the stored row so the wall-clock clamp admits a long beat, as real elapsed playback would.
  const elapse = (secs: number) => {
    if (stored) stored.updatedAt = new Date(Date.now() - secs * 1000);
  };
  return { beat, elapse, tasks };
}

describe('ProgressService.updateVideo', () => {
  it('marks the video completed once unique coverage reaches the threshold', async () => {
    const { beat, elapse, tasks } = build();
    await beat([]);
    elapse(600);

    const row = await beat([[0, 85]]);

    expect(row.status).toBe(ProgressStatus.COMPLETED);
    expect(row.percent).toBe(85);
    expect(row.completedAt).toBeInstanceOf(Date);
    expect(tasks.syncForResource).toHaveBeenLastCalledWith(
      expect.anything(),
      actor.sub,
      ResourceType.VIDEO,
      VIDEO_ID,
      ProgressStatus.COMPLETED,
      row.completedAt,
    );
  });

  it('keeps the video in progress just below the threshold', async () => {
    const { beat, elapse } = build();
    await beat([]);
    elapse(600);

    const row = await beat([[0, 84]]);

    expect(row.status).toBe(ProgressStatus.IN_PROGRESS);
    expect(row.completedAt).toBeNull();
  });

  it('marks a fully played video completed at 100 percent', async () => {
    const { beat, elapse } = build();
    await beat([]);
    elapse(600);

    const row = await beat([[0, DURATION_SECS]]);

    expect(row.status).toBe(ProgressStatus.COMPLETED);
    expect(row.percent).toBe(100);
  });

  it('honours the configured threshold rather than a fixed one', async () => {
    const { beat, elapse } = build(70);
    await beat([]);
    elapse(600);

    const row = await beat([[0, 70]]);

    expect(row.status).toBe(ProgressStatus.COMPLETED);
  });

  it('does not count rewatching the same range towards completion', async () => {
    const { beat, elapse } = build();
    await beat([]);
    elapse(600);
    await beat([[0, 50]]);
    elapse(600);

    const row = await beat([[0, 50]]);

    expect(row.percent).toBe(50);
    expect(row.status).toBe(ProgressStatus.IN_PROGRESS);
  });

  it('clips a first beat to the clock slack when no row has started the clock', async () => {
    const { beat } = build();

    const row = await beat([[0, 15]]);

    expect(row.coveredSecs).toBe(10);
  });

  it('keeps the whole next beat when an empty opening beat started the clock', async () => {
    const { beat, elapse } = build();
    await beat([]);
    elapse(15);

    const row = await beat([[0, 15]]);

    expect(row.coveredSecs).toBe(15);
  });
});
