import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SubjectStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ActorContentScopeService } from '../entitlements/actor-content-scope.service';
import { actorScopeOf, requireReadable } from '../common/authorization/resource-access';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { VideosAccessPolicy } from './videos-access.policy';
import { CreateVideoDto } from './dto/create-video.dto';
import { VideoEntity } from './entities/video.entity';

const VIDEO_SELECT = {
  id: true,
  title: true,
  description: true,
  durationSecs: true,
  gradeLevelId: true,
  subjectId: true,
} as const;

// The entitlement-gated read path behind both HTTP surfaces: /videos (TEACHER, STUDENT)
// and /admin/videos (SUPER_ADMIN). Every school-facing read resolves its visible
// (grade, subject) pairs through ActorContentScopeService rather than deciding here.
@Injectable()
export class VideosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contentScope: ActorContentScopeService,
    private readonly videosAccessPolicy: VideosAccessPolicy,
  ) {}

  // One fetch, then the policy decides — a video the caller isn't entitled to is
  // indistinguishable from one that doesn't exist.
  async findOneVisibleTo(id: string, actor: AuthenticatedUser): Promise<VideoEntity> {
    const video = await this.prisma.video.findUnique({ where: { id }, select: VIDEO_SELECT });
    return requireReadable<VideoEntity>(
      video,
      actorScopeOf(actor),
      this.videosAccessPolicy,
      'Video not found',
    );
  }

  async findAllVisibleTo(actor: AuthenticatedUser): Promise<VideoEntity[]> {
    const scope = await this.contentScope.resolve(actorScopeOf(actor));

    if (scope === 'all') {
      return this.prisma.video.findMany({ select: VIDEO_SELECT, orderBy: { title: 'asc' } });
    }

    // An empty scope must not fall through to an empty `OR`, which Prisma treats as no
    // filter at all and would return the whole library.
    if (scope.length === 0) {
      return [];
    }

    return this.prisma.video.findMany({
      where: { OR: scope.map(({ gradeLevelId, subjectId }) => ({ gradeLevelId, subjectId })) },
      select: VIDEO_SELECT,
      orderBy: { title: 'asc' },
    });
  }

  // SUPER_ADMIN only (see VideosAdminController). Videos are platform content, so there
  // is no tenant to stamp — but the taxonomy FKs are caller-supplied and must be proven
  // to exist, or Prisma's raw foreign-key violation would surface as a 500.
  async create(dto: CreateVideoDto): Promise<VideoEntity> {
    const [gradeLevel, subject] = await this.prisma.$transaction([
      this.prisma.gradeLevel.count({ where: { id: dto.gradeLevelId } }),
      this.prisma.subject.findUnique({ where: { id: dto.subjectId }, select: { status: true } }),
    ]);

    if (gradeLevel === 0) {
      throw new NotFoundException('Grade level not found');
    }
    if (subject === null) {
      throw new NotFoundException('Subject not found');
    }
    // 409 rather than 404: the subject exists and this caller can see it in
    // GET /admin/subjects. Retirement stops *new* references, so existing videos on a
    // retired subject stay readable.
    if (subject.status === SubjectStatus.RETIRED) {
      throw new ConflictException('This subject is retired and cannot take new content');
    }

    return this.prisma.video.create({
      data: {
        title: dto.title,
        description: dto.description,
        externalId: dto.externalId,
        durationSecs: dto.durationSecs,
        gradeLevelId: dto.gradeLevelId,
        subjectId: dto.subjectId,
      } satisfies Prisma.VideoUncheckedCreateInput,
      select: VIDEO_SELECT,
    });
  }
}
