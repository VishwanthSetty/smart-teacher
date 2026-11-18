import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DocumentStatus,
  Prisma,
  ProgressStatus,
  ResourceType,
  VideoStatus,
} from '@prisma/client';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { actorScopeOf } from '../common/authorization/resource-access';
import { DocumentsService } from '../documents/documents.service';
import { ActorContentScopeService } from '../entitlements/actor-content-scope.service';
import { PrismaService } from '../prisma/prisma.service';
import { TasksService } from '../tasks/tasks.service';
import { VideosService } from '../videos/videos.service';
import type { UpdateDocumentProgressDto } from './dto/update-document-progress.dto';
import type { UpdateVideoProgressDto } from './dto/update-video-progress.dto';
import {
  coveredSeconds,
  limitIntervalsToCoverage,
  mergeWatchIntervals,
  parseWatchIntervals,
  type WatchInterval,
} from './watch-intervals.util';

const ACTIVITY_SELECT = {
  id: true,
  resourceType: true,
  videoId: true,
  documentId: true,
  status: true,
  positionSecs: true,
  watchedIntervals: true,
  coveredSecs: true,
  percent: true,
  lastPage: true,
  pageCount: true,
  markedCompleteAt: true,
  completedAt: true,
  firstAccessedAt: true,
  lastAccessedAt: true,
  updatedAt: true,
} as const satisfies Prisma.ResourceActivitySelect;

export type ActivityEntity = Prisma.ResourceActivityGetPayload<{ select: typeof ACTIVITY_SELECT }>;
type ActivityTx = Pick<PrismaService, 'resourceActivity' | 'taskAssignment'>;

@Injectable()
export class ProgressService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly videos: VideosService,
    private readonly documents: DocumentsService,
    private readonly contentScope: ActorContentScopeService,
    private readonly tasks: TasksService,
  ) {}

  async updateVideo(
    videoId: string,
    dto: UpdateVideoProgressDto,
    actor: AuthenticatedUser,
  ): Promise<ActivityEntity> {
    const video = await this.videos.findPlayableVisibleTo(videoId, actor);
    if (!actor.schoolId) throw new NotFoundException('Video not found');
    if (!video.durationSecs || video.durationSecs <= 0) {
      throw new BadRequestException('Video duration is not available');
    }
    const schoolId = actor.schoolId;
    const durationSecs = video.durationSecs;
    const incoming = validateIntervals(dto.intervals);
    const now = new Date();

    return this.withSerializableRetry(async (tx) => {
      const existing = await tx.resourceActivity.findUnique({
        where: { userId_videoId: { userId: actor.sub, videoId } },
        select: ACTIVITY_SELECT,
      });
      const elapsed = existing ? Math.max(0, (now.getTime() - existing.updatedAt.getTime()) / 1000) : 0;
      const maximumCoverage =
        elapsed * this.config.getOrThrow<number>('MAX_PLAYBACK_RATE') +
        this.config.getOrThrow<number>('PROGRESS_CLOCK_SLACK_SECS');
      const accepted = limitIntervalsToCoverage(incoming, durationSecs, maximumCoverage);
      const merged = mergeWatchIntervals(
        [...parseWatchIntervals(existing?.watchedIntervals), ...accepted],
        durationSecs,
      );
      const coveredSecs = coveredSeconds(merged);
      const percent = Math.min(100, Math.round((coveredSecs / durationSecs) * 100));
      const status =
        percent >= this.config.getOrThrow<number>('VIDEO_COMPLETION_PERCENT')
          ? ProgressStatus.COMPLETED
          : ProgressStatus.IN_PROGRESS;
      const clientUpdatedAt = clampClientDate(
        dto.clientUpdatedAt,
        now,
        this.config.getOrThrow<number>('PROGRESS_CLOCK_SLACK_SECS'),
      );
      const positionIsNewer = existing === null || clientUpdatedAt > existing.updatedAt;
      const completedAt = existing?.completedAt ?? (status === ProgressStatus.COMPLETED ? now : null);
      const data = {
        schoolId,
        userId: actor.sub,
        resourceType: ResourceType.VIDEO,
        videoId,
        status,
        positionSecs: positionIsNewer
          ? Math.min(dto.positionSecs, durationSecs)
          : (existing?.positionSecs ?? 0),
        watchedIntervals: merged.map((interval) => [...interval]),
        coveredSecs,
        percent,
        completedAt,
        lastAccessedAt: now,
      } satisfies Prisma.ResourceActivityUncheckedCreateInput;
      const row = await tx.resourceActivity.upsert({
        where: { userId_videoId: { userId: actor.sub, videoId } },
        create: data,
        update: data,
        select: ACTIVITY_SELECT,
      });
      await this.tasks.syncForResource(
        tx,
        actor.sub,
        ResourceType.VIDEO,
        videoId,
        status,
        completedAt,
      );
      return row;
    });
  }

  async updateDocument(
    documentId: string,
    dto: UpdateDocumentProgressDto,
    actor: AuthenticatedUser,
  ): Promise<ActivityEntity> {
    const document = await this.documents.findOneVisibleTo(documentId, actor);
    if (!actor.schoolId) throw new NotFoundException('Document not found');
    const schoolId = actor.schoolId;
    const now = new Date();
    const clientUpdatedAt = clampClientDate(
      dto.clientUpdatedAt,
      now,
      this.config.getOrThrow<number>('PROGRESS_CLOCK_SLACK_SECS'),
    );
    const existing = await this.prisma.resourceActivity.findUnique({
      where: { userId_documentId: { userId: actor.sub, documentId } },
      select: ACTIVITY_SELECT,
    });
    const pageCount = document.pageCount ?? dto.pageCount ?? existing?.pageCount ?? null;
    const positionIsNewer = existing === null || clientUpdatedAt > existing.updatedAt;
    const status = existing?.completedAt ? ProgressStatus.COMPLETED : ProgressStatus.IN_PROGRESS;
    const lastPage = positionIsNewer
      ? Math.min(dto.lastPage, pageCount ?? dto.lastPage)
      : (existing?.lastPage ?? null);
    const percent = pageCount ? Math.min(100, Math.round(((lastPage ?? 0) / pageCount) * 100)) : 0;
    const data = {
      schoolId,
      userId: actor.sub,
      resourceType: ResourceType.DOCUMENT,
      documentId,
      status,
      lastPage,
      pageCount,
      percent,
      markedCompleteAt: existing?.markedCompleteAt ?? null,
      completedAt: existing?.completedAt ?? null,
      lastAccessedAt: now,
    } satisfies Prisma.ResourceActivityUncheckedCreateInput;
    const row = await this.prisma.resourceActivity.upsert({
      where: { userId_documentId: { userId: actor.sub, documentId } },
      create: data,
      update: data,
      select: ACTIVITY_SELECT,
    });
    await this.tasks.syncForResource(
      this.prisma,
      actor.sub,
      ResourceType.DOCUMENT,
      documentId,
      status,
      row.completedAt,
    );
    return row;
  }

  async markDocumentComplete(
    documentId: string,
    actor: AuthenticatedUser,
  ): Promise<ActivityEntity> {
    await this.documents.findOneVisibleTo(documentId, actor);
    if (!actor.schoolId) throw new NotFoundException('Document not found');
    const schoolId = actor.schoolId;
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.resourceActivity.findUnique({
        where: { userId_documentId: { userId: actor.sub, documentId } },
        select: { markedCompleteAt: true, completedAt: true },
      });
      const completedAt = existing?.completedAt ?? now;
      const row = await tx.resourceActivity.upsert({
        where: { userId_documentId: { userId: actor.sub, documentId } },
        create: {
          schoolId,
          userId: actor.sub,
          resourceType: ResourceType.DOCUMENT,
          documentId,
          status: ProgressStatus.COMPLETED,
          markedCompleteAt: now,
          completedAt,
          lastAccessedAt: now,
        },
        update: {
          status: ProgressStatus.COMPLETED,
          markedCompleteAt: existing?.markedCompleteAt ?? now,
          completedAt,
          lastAccessedAt: now,
        },
        select: ACTIVITY_SELECT,
      });
      await this.tasks.syncForResource(
        tx,
        actor.sub,
        ResourceType.DOCUMENT,
        documentId,
        ProgressStatus.COMPLETED,
        completedAt,
      );
      return row;
    });
  }

  async unmarkDocumentComplete(
    documentId: string,
    actor: AuthenticatedUser,
  ): Promise<ActivityEntity> {
    await this.documents.findOneVisibleTo(documentId, actor);
    const existing = await this.prisma.resourceActivity.findUnique({
      where: { userId_documentId: { userId: actor.sub, documentId } },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Progress not found');
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.resourceActivity.update({
        where: { id: existing.id },
        data: {
          status: ProgressStatus.IN_PROGRESS,
          markedCompleteAt: null,
          completedAt: null,
          lastAccessedAt: new Date(),
        },
        select: ACTIVITY_SELECT,
      });
      await this.tasks.syncForResource(
        tx,
        actor.sub,
        ResourceType.DOCUMENT,
        documentId,
        ProgressStatus.IN_PROGRESS,
        null,
      );
      return row;
    });
  }

  async summary(actor: AuthenticatedUser): Promise<Array<Record<string, string | number>>> {
    const scope = await this.contentScope.resolveBrowse(actorScopeOf(actor));
    const curriculumFilter = scope === 'all' ? undefined : { in: scope };
    const [videos, documents, activities] = await Promise.all([
      this.prisma.video.findMany({
        where: { status: VideoStatus.READY, node: { curriculumId: curriculumFilter } },
        select: { id: true, node: { select: { curriculum: { select: curriculumSummarySelect } } } },
      }),
      this.prisma.document.findMany({
        where: { status: DocumentStatus.READY, node: { curriculumId: curriculumFilter } },
        select: { id: true, node: { select: { curriculum: { select: curriculumSummarySelect } } } },
      }),
      this.prisma.resourceActivity.findMany({
        where: { userId: actor.sub },
        select: { videoId: true, documentId: true, status: true },
      }),
    ]);
    const statusByResource = new Map(
      activities.map((activity) => [activity.videoId ?? activity.documentId, activity.status]),
    );
    const rollups = new Map<string, SummaryAccumulator>();
    for (const resource of [...videos, ...documents]) {
      const curriculum = resource.node.curriculum;
      const key = `${curriculum.gradeLevelId}:${curriculum.subjectId}`;
      const current = rollups.get(key) ?? {
        subjectId: curriculum.subjectId,
        subjectName: curriculum.subject.name,
        gradeLevelId: curriculum.gradeLevelId,
        total: 0,
        inProgress: 0,
        completed: 0,
      };
      current.total += 1;
      const status = statusByResource.get(resource.id);
      if (status === ProgressStatus.COMPLETED) current.completed += 1;
      if (status === ProgressStatus.IN_PROGRESS) current.inProgress += 1;
      rollups.set(key, current);
    }
    return [...rollups.values()].map((row) => ({
      ...row,
      notStarted: row.total - row.inProgress - row.completed,
      percent: row.total === 0 ? 0 : Math.round((row.completed / row.total) * 100),
    }));
  }

  private async withSerializableRetry<T>(operation: (tx: ActivityTx) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2034' || attempt === 2) {
          throw error;
        }
      }
    }
    throw new Error('Unreachable transaction retry state');
  }
}

const curriculumSummarySelect = {
  gradeLevelId: true,
  subjectId: true,
  subject: { select: { name: true } },
} as const;

interface SummaryAccumulator {
  subjectId: string;
  subjectName: string;
  gradeLevelId: string;
  total: number;
  inProgress: number;
  completed: number;
}

function validateIntervals(value: number[][]): WatchInterval[] {
  return value.map((interval) => {
    if (
      interval.length !== 2 ||
      typeof interval[0] !== 'number' ||
      typeof interval[1] !== 'number' ||
      !Number.isFinite(interval[0]) ||
      !Number.isFinite(interval[1])
    ) {
      throw new BadRequestException('Each interval must contain a finite start and end');
    }
    return [interval[0], interval[1]] as const;
  });
}

function clampClientDate(value: string, now: Date, slackSecs: number): Date {
  const parsed = new Date(value);
  const latest = new Date(now.getTime() + slackSecs * 1000);
  return parsed > latest ? now : parsed;
}
