import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CurriculumStatus, Prisma, SubjectStatus, VideoStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ActorContentScopeService } from '../entitlements/actor-content-scope.service';
import { actorScopeOf, requireReadable } from '../common/authorization/resource-access';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { StorageService } from '../storage/storage.service';
import { TranscodeQueue } from '../transcoding/transcode-queue';
import { VideosAccessPolicy } from './videos-access.policy';
import { TranscodeReconcilerService } from './transcode-reconciler.service';
import { CreateVideoDto } from './dto/create-video.dto';
import { ListAdminVideosQueryDto } from './dto/list-admin-videos-query.dto';
import { RequestVideoUploadDto } from './dto/request-video-upload.dto';
import { UpdateVideoDto } from './dto/update-video.dto';
import { VideoEntity } from './entities/video.entity';
import { AdminVideoEntity } from './entities/admin-video.entity';
import { AdminVideoDetailEntity } from './entities/admin-video-detail.entity';
import { PaginatedAdminVideosEntity } from './entities/paginated-admin-videos.entity';
import { VideoUploadTicketEntity } from './entities/video-upload-ticket.entity';
import { isAcceptedVideoContentType, MAX_VIDEO_BYTES } from './video-ingest.constants';

// The node join is what supplies the entitlement key now that a video carries no grade
// level or subject of its own. It is a to-one chain between platform-global models
// (Video -> ContentNode -> Curriculum), so it never enters the tenant guard's walker.
const NODE_SELECT = {
  select: {
    title: true,
    curriculumId: true,
    curriculum: { select: { gradeLevelId: true, subjectId: true } },
  },
} as const;

const VIDEO_SELECT = {
  id: true,
  title: true,
  description: true,
  durationSecs: true,
  contentNodeId: true,
  node: NODE_SELECT,
} as const;

const ADMIN_VIDEO_SELECT = {
  ...VIDEO_SELECT,
  status: true,
  sizeBytes: true,
  contentType: true,
  createdAt: true,
  // Why the last transcode failed, so a SUPER_ADMIN can tell a corrupt source from a dead
  // worker. playlistKey/posterKey stay out for the same reason as sourceKey: they are
  // internal bucket paths, and serving them to a client is a separate feature.
  failureReason: true,
} as const;

type VideoRow = Prisma.VideoGetPayload<{ select: typeof VIDEO_SELECT }>;
type AdminVideoRow = Prisma.VideoGetPayload<{ select: typeof ADMIN_VIDEO_SELECT }>;

// Flattens the node join into the response shape. Callers never see the nested Prisma
// row — the entities are an explicit contract, so a new column on ContentNode or
// Curriculum cannot leak through a spread.
function toVideoEntity(row: VideoRow): VideoEntity {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    durationSecs: row.durationSecs,
    contentNodeId: row.contentNodeId,
    contentNodeTitle: row.node.title,
    curriculumId: row.node.curriculumId,
    gradeLevelId: row.node.curriculum.gradeLevelId,
    subjectId: row.node.curriculum.subjectId,
  };
}

function toAdminVideoEntity(row: AdminVideoRow): AdminVideoEntity {
  return {
    ...toVideoEntity(row),
    status: row.status,
    sizeBytes: row.sizeBytes,
    contentType: row.contentType,
    failureReason: row.failureReason,
    createdAt: row.createdAt,
  };
}

export interface PlayableVideo {
  id: string;
  durationSecs: number | null;
  curriculumId: string;
  playlistKey: string;
  posterKey: string | null;
}

// The entitlement-gated read path behind both HTTP surfaces: /videos (TEACHER, STUDENT)
// and /admin/videos (SUPER_ADMIN). Every school-facing read resolves its visible
// (grade, subject) pairs through ActorContentScopeService rather than deciding here.
//
// Ingest lives here too. A Video row is not synonymous with watchable content: it is
// created in UPLOADING before any media exists, so every school-facing read narrows to
// READY on top of the entitlement check.
@Injectable()
export class VideosService {
  private readonly logger = new Logger(VideosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly contentScope: ActorContentScopeService,
    private readonly videosAccessPolicy: VideosAccessPolicy,
    private readonly storage: StorageService,
    private readonly transcodeQueue: TranscodeQueue,
    private readonly reconciler: TranscodeReconcilerService,
  ) {}

  // One fetch, then the policy decides — a video the caller isn't entitled to is
  // indistinguishable from one that doesn't exist. The status filter is part of the
  // same fetch so an in-flight upload reads as a 404 rather than a filtered-out 200.
  async findOneVisibleTo(id: string, actor: AuthenticatedUser): Promise<VideoEntity> {
    const row = await this.prisma.video.findFirst({
      where: { id, status: VideoStatus.READY },
      select: VIDEO_SELECT,
    });
    return requireReadable<VideoEntity>(
      row === null ? null : toVideoEntity(row),
      actorScopeOf(actor),
      this.videosAccessPolicy,
      'Video not found',
    );
  }

  async findPlayableVisibleTo(id: string, actor: AuthenticatedUser): Promise<PlayableVideo> {
    const row = await this.prisma.video.findFirst({
      where: { id, status: VideoStatus.READY },
      select: {
        id: true,
        durationSecs: true,
        playlistKey: true,
        posterKey: true,
        node: { select: { curriculumId: true } },
      },
    });
    const playable =
      row === null
        ? null
        : {
            id: row.id,
            durationSecs: row.durationSecs,
            curriculumId: row.node.curriculumId,
            playlistKey: row.playlistKey,
            posterKey: row.posterKey,
          };
    const readable = await requireReadable<NonNullable<typeof playable>>(
      playable,
      actorScopeOf(actor),
      this.videosAccessPolicy,
      'Video not found',
    );
    if (readable.playlistKey === null) {
      throw new NotFoundException('Video not found');
    }
    return { ...readable, playlistKey: readable.playlistKey };
  }

  // The PUBLISHED narrowing is deliberately absent from this `where`: the scope returned
  // by ActorContentScopeService already excludes unpublished curricula, and adding a
  // second filter here would hide draft content from the 'all' branch — which is exactly
  // the preview a SUPER_ADMIN needs before publishing. One seam, one answer.
  async findAllVisibleTo(actor: AuthenticatedUser): Promise<VideoEntity[]> {
    const scope = await this.contentScope.resolve(actorScopeOf(actor));

    if (scope === 'all') {
      const rows = await this.prisma.video.findMany({
        where: { status: VideoStatus.READY },
        select: VIDEO_SELECT,
        orderBy: { title: 'asc' },
      });
      return rows.map(toVideoEntity);
    }

    // An empty scope must not fall through to an empty `in`, so the early return stays
    // even though Prisma handles `in: []` correctly — it states the intent.
    if (scope.length === 0) {
      return [];
    }

    const rows = await this.prisma.video.findMany({
      where: {
        status: VideoStatus.READY,
        node: { curriculumId: { in: scope } },
      },
      select: VIDEO_SELECT,
      orderBy: { title: 'asc' },
    });
    return rows.map(toVideoEntity);
  }

  // The management view: every status, no entitlement scoping. SUPER_ADMIN resolves to
  // 'all' anyway, so going through ActorContentScopeService here would only obscure
  // that this list is deliberately unfiltered.
  async findAllForAdmin(
    query: ListAdminVideosQueryDto = new ListAdminVideosQueryDto(),
  ): Promise<PaginatedAdminVideosEntity> {
    // Before the read, not after: this is the only place a stuck QUEUED/PROCESSING row is
    // ever observed, so sweeping first means the admin can never be shown a row that
    // claims work nobody is doing.
    await this.reconciler.sweepStale();

    const search = query.search?.trim();
    // Grade level and subject are no longer columns on Video — they resolve through the
    // node's curriculum, so those filters become one nested condition.
    const curriculumFilter: Prisma.CurriculumWhereInput = {
      ...(query.gradeLevelId ? { gradeLevelId: query.gradeLevelId } : {}),
      ...(query.subjectId ? { subjectId: query.subjectId } : {}),
      ...(query.curriculumId ? { id: query.curriculumId } : {}),
    };
    const nodeFilter: Prisma.ContentNodeWhereInput = {
      ...(query.contentNodeId ? { id: query.contentNodeId } : {}),
      ...(Object.keys(curriculumFilter).length > 0 ? { curriculum: curriculumFilter } : {}),
    };
    const where: Prisma.VideoWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(Object.keys(nodeFilter).length > 0 ? { node: nodeFilter } : {}),
      ...(search ? { title: { contains: search, mode: 'insensitive' } } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.video.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: ADMIN_VIDEO_SELECT,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.video.count({ where }),
    ]);
    return {
      data: data.map(toAdminVideoEntity),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async findOneForAdmin(id: string): Promise<AdminVideoDetailEntity> {
    const video = await this.prisma.video.findUnique({
      where: { id },
      select: {
        ...ADMIN_VIDEO_SELECT,
        updatedAt: true,
        transcodeAttempts: true,
        transcodeStartedAt: true,
        retainSource: true,
        sourceKey: true,
        playlistKey: true,
        posterKey: true,
        renditions: {
          select: {
            id: true,
            name: true,
            width: true,
            height: true,
            bitrateKbps: true,
            playlistKey: true,
          },
          orderBy: { height: 'asc' },
        },
      },
    });
    if (video === null) {
      throw new NotFoundException('Video not found');
    }
    return {
      ...toAdminVideoEntity(video),
      updatedAt: video.updatedAt,
      transcodeAttempts: video.transcodeAttempts,
      transcodeStartedAt: video.transcodeStartedAt,
      retainSource: video.retainSource,
      sourceKey: video.sourceKey,
      playlistKey: video.playlistKey,
      posterKey: video.posterKey,
      renditions: video.renditions,
    };
  }

  // SUPER_ADMIN only (see VideosAdminController). Videos are platform content, so there
  // is no tenant to stamp — but the taxonomy FKs are caller-supplied and must be proven
  // to exist, or Prisma's raw foreign-key violation would surface as a 500.
  async create(dto: CreateVideoDto): Promise<VideoUploadTicketEntity> {
    await this.assertNodeUsable(dto.contentNodeId);

    // The object key derives from the generated id, so the row must exist before the
    // key does. Both writes go in one transaction: a row stranded without a sourceKey
    // could never be uploaded to nor retried.
    const video = await this.prisma.$transaction(async (tx) => {
      const created = await tx.video.create({
        data: {
          title: dto.title,
          description: dto.description,
          durationSecs: dto.durationSecs,
          contentNodeId: dto.contentNodeId,
          status: VideoStatus.UPLOADING,
        } satisfies Prisma.VideoUncheckedCreateInput,
        select: { id: true },
      });

      return tx.video.update({
        where: { id: created.id },
        data: { sourceKey: sourceKeyFor(created.id) },
        select: ADMIN_VIDEO_SELECT,
      });
    });

    // Presigned only after the transaction commits: a URL handed out for a row that
    // then rolled back would authorise writes to an object nothing owns.
    return this.issueUploadTicket(toAdminVideoEntity(video), sourceKeyFor(video.id), dto.contentType);
  }

  async update(id: string, dto: UpdateVideoDto): Promise<AdminVideoDetailEntity> {
    const current = await this.prisma.video.findUnique({
      where: { id },
      select: { contentNodeId: true },
    });
    if (current === null) {
      throw new NotFoundException('Video not found');
    }
    // Re-filing can move a video into a different curriculum, which changes which schools
    // see it — so the destination is validated exactly as it was at create time.
    if (dto.contentNodeId !== undefined && dto.contentNodeId !== current.contentNodeId) {
      await this.assertNodeUsable(dto.contentNodeId);
    }
    await this.prisma.video.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        contentNodeId: dto.contentNodeId,
        retainSource: dto.retainSource,
      },
    });
    return this.findOneForAdmin(id);
  }

  // Retry for an abandoned or failed upload. The key is reused, so a successful retry
  // overwrites whatever partial object was left behind.
  async createUploadUrl(id: string, dto: RequestVideoUploadDto): Promise<VideoUploadTicketEntity> {
    const row = await this.prisma.video.findUnique({
      where: { id },
      select: { ...ADMIN_VIDEO_SELECT, sourceKey: true },
    });

    if (row === null) {
      throw new NotFoundException('Video not found');
    }
    // Re-presigning a video that is already live (or on its way there) would let an
    // admin swap the source out from under schools that are entitled to it.
    if (row.status !== VideoStatus.UPLOADING && row.status !== VideoStatus.FAILED) {
      throw new ConflictException('This video is not awaiting an upload');
    }
    if (row.sourceKey === null) {
      throw new ConflictException('This video has no upload destination');
    }

    // Back to UPLOADING, and clear the verified values from the attempt that failed.
    // Without this a retried video stays FAILED, and markUploaded — which only accepts
    // UPLOADING — would reject the very upload this ticket was issued for.
    const video = await this.prisma.video.update({
      where: { id: row.id },
      data: { status: VideoStatus.UPLOADING, sizeBytes: null, contentType: null },
      select: ADMIN_VIDEO_SELECT,
    });

    return this.issueUploadTicket(toAdminVideoEntity(video), row.sourceKey, dto.contentType);
  }

  /**
   * Confirms the client finished its PUT. The declared size and type were only ever a
   * request, so this reads the object back and judges what actually landed — a client
   * talking straight to the bucket can send anything the signature permits, including
   * nothing at all.
   */
  async markUploaded(id: string): Promise<AdminVideoEntity> {
    // A bulk ingest self-heals as it proceeds: each confirmation sweeps whatever the
    // previous batch left stuck, without waiting for an admin to open the library.
    await this.reconciler.sweepStale();

    const video = await this.prisma.video.findUnique({
      where: { id },
      select: { id: true, status: true, sourceKey: true },
    });

    if (video === null) {
      throw new NotFoundException('Video not found');
    }
    // Confirming twice must not enqueue twice — the same 409-on-re-confirm contract as
    // the bulk-import batches.
    if (video.status !== VideoStatus.UPLOADING) {
      throw new ConflictException('This video is not awaiting an upload');
    }
    if (video.sourceKey === null) {
      throw new ConflictException('This video has no upload destination');
    }

    const stored = await this.storage.statObject(video.sourceKey);

    if (stored === null) {
      throw await this.failUpload(video.id, 'No file was uploaded for this video');
    }
    if (stored.sizeBytes === 0) {
      throw await this.failUpload(video.id, 'The uploaded file is empty');
    }
    if (stored.sizeBytes > MAX_VIDEO_BYTES) {
      throw await this.failUpload(video.id, 'The uploaded file is larger than the 2 GB limit');
    }
    if (!isAcceptedVideoContentType(stored.contentType)) {
      throw await this.failUpload(video.id, 'The uploaded file is not an MP4 or MOV video');
    }

    const queued = await this.prisma.video.update({
      where: { id: video.id },
      data: {
        status: VideoStatus.QUEUED,
        sizeBytes: stored.sizeBytes,
        contentType: stored.contentType,
        // Bumped with the enqueue so the job and the row agree on which attempt this is.
        // Every callback echoes it back and is refused if it has fallen behind.
        transcodeAttempts: { increment: 1 },
        failureReason: null,
      },
      select: { ...ADMIN_VIDEO_SELECT, transcodeAttempts: true },
    });

    // Split off rather than returned: the attempt is the queue's fencing token, and the
    // admin entity has no business carrying it.
    const { transcodeAttempts, ...row } = queued;
    const entity = toAdminVideoEntity(row);

    // After the commit: a job for a video that rolled back would point at nothing. The
    // reverse risk (committed but never enqueued) is recoverable — the row sits in
    // QUEUED and can be re-driven — whereas a phantom job cannot be withdrawn.
    await this.enqueueTranscode(video.id, video.sourceKey, transcodeAttempts);

    return entity;
  }

  /**
   * Re-drives a failed transcode without making anyone re-upload.
   *
   * Forcing a fresh 2 GB upload because the *worker* died — when the source is sitting
   * intact in the bucket — is punitive, and after the reconciler fires it would be the
   * only way out. createUploadUrl remains the path for a bad *source*.
   */
  async retry(id: string): Promise<AdminVideoEntity> {
    const video = await this.prisma.video.findUnique({
      where: { id },
      select: { id: true, status: true, sourceKey: true },
    });

    if (video === null) {
      throw new NotFoundException('Video not found');
    }
    // Only FAILED: re-driving a QUEUED or PROCESSING video would put a second worker on
    // a job the first may still be running, and READY needs no rescuing.
    if (video.status !== VideoStatus.FAILED) {
      throw new ConflictException('Only a failed video can be retried');
    }
    if (video.sourceKey === null) {
      throw new ConflictException('This video has no source to transcode');
    }
    // Checked now rather than discovered by the worker: without the source, the job would
    // simply fail again and the admin would learn nothing for another 45 minutes.
    if ((await this.storage.statObject(video.sourceKey)) === null) {
      throw new ConflictException('The source file is no longer in the ingest bucket');
    }

    const [requeued] = await this.prisma.$transaction([
      this.prisma.video.update({
        where: { id: video.id },
        data: {
          status: VideoStatus.QUEUED,
          failureReason: null,
          transcodeAttempts: { increment: 1 },
          transcodeStartedAt: null,
        },
        select: { ...ADMIN_VIDEO_SELECT, transcodeAttempts: true },
      }),
      // The previous attempt's renditions name objects the next run will overwrite or
      // delete; leaving them would describe a ladder that no longer exists.
      this.prisma.videoRendition.deleteMany({ where: { videoId: video.id } }),
    ]);

    const { transcodeAttempts, ...row } = requeued;
    const entity = toAdminVideoEntity(row);

    await this.enqueueTranscode(video.id, video.sourceKey, transcodeAttempts);

    return entity;
  }

  async remove(id: string): Promise<void> {
    const video = await this.prisma.video.findUnique({
      where: { id },
      select: { id: true, status: true, sourceKey: true },
    });

    if (video === null) {
      throw new NotFoundException('Video not found');
    }
    // This is a deliberate retirement path. A worker is mid-flight: deleting now
    // orphans everything it has already written under
    // videos/{id}/ and leaves its callback pointing at nothing. Not permanent — the
    // reconciler moves the row to FAILED once the window passes, restoring deletability.
    if (video.status === VideoStatus.PROCESSING) {
      throw new ConflictException('This video is being transcoded and cannot be deleted yet');
    }

    await this.prisma.video.delete({ where: { id: video.id } });

    // Best-effort, and deliberately after the row is gone: an orphaned object costs
    // storage and can be swept later, whereas a row pointing at a deleted object would
    // be a video that can never be played or retried.
    try {
      await this.storage.deletePrefix(`videos/${video.id}/`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Deleted video ${video.id} but left its HLS output behind: ${reason}`);
    }
    if (video.sourceKey !== null) {
      try {
        await this.storage.deleteObject(video.sourceKey);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Deleted video ${video.id} but left ${video.sourceKey} behind: ${reason}`);
      }
    }
  }

  private async issueUploadTicket(
    video: AdminVideoEntity,
    sourceKey: string,
    contentType: string,
  ): Promise<VideoUploadTicketEntity> {
    const upload = await this.storage.createPresignedUpload(sourceKey, contentType);
    return { video, uploadUrl: upload.url, expiresInSecs: upload.expiresInSecs };
  }

  /**
   * Proves the destination node can actually hold this video.
   *
   * The caller supplies the node id, so it must be shown to exist or Prisma's raw
   * foreign-key violation would surface as a 500. Beyond existence there are three rules,
   * all enforced here rather than left to the UI: the node's level must be marked
   * content-holding (videos hang off topics, not chapters), the curriculum must not be
   * archived, and its subject must not be retired.
   */
  private async assertNodeUsable(contentNodeId: string): Promise<void> {
    const node = await this.prisma.contentNode.findUnique({
      where: { id: contentNodeId },
      select: {
        depth: true,
        curriculum: {
          select: {
            status: true,
            subject: { select: { status: true } },
            schema: { select: { levels: { select: { depth: true, canHoldContent: true } } } },
          },
        },
      },
    });
    if (node === null) {
      throw new NotFoundException('Content node not found');
    }
    if (node.curriculum.subject.status === SubjectStatus.RETIRED) {
      throw new ConflictException('This subject is retired and cannot take new content');
    }
    if (node.curriculum.status === CurriculumStatus.ARCHIVED) {
      throw new ConflictException('This curriculum is archived and cannot take new content');
    }
    const level = node.curriculum.schema.levels.find((candidate) => candidate.depth === node.depth);
    if (level === undefined || !level.canHoldContent) {
      throw new ConflictException('Videos cannot be attached at this level of the curriculum');
    }
  }

  /**
   * Hands the job to the broker, tolerating a broker outage.
   *
   * The row is already committed as QUEUED by the time this runs, and the comment on that
   * commit states the posture: committed-but-never-enqueued is the recoverable direction.
   * Throwing here would return a 5xx for a video that *is* queued, so the failure is
   * logged instead — the reconciler fails the row after the window and retry
   * re-drives it.
   */
  private async enqueueTranscode(videoId: string, sourceKey: string, attempt: number): Promise<void> {
    try {
      await this.transcodeQueue.enqueue({ videoId, sourceKey, attempt });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Video ${videoId} is QUEUED but attempt ${attempt} could not be enqueued: ${reason}`,
      );
    }
  }

  // Records why the upload was rejected before the caller is told, so a failed video is
  // visible as FAILED in the library rather than sitting in UPLOADING forever.
  private async failUpload(id: string, message: string): Promise<BadRequestException> {
    await this.prisma.video.update({
      where: { id },
      data: { status: VideoStatus.FAILED },
    });
    return new BadRequestException(message);
  }
}

function sourceKeyFor(videoId: string): string {
  return `${videoId}/source.mp4`;
}
