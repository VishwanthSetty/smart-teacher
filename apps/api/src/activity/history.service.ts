import { Injectable } from '@nestjs/common';
import { DocumentStatus, Prisma, ProgressStatus, VideoStatus } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { actorScopeOf } from '../common/authorization/resource-access';
import { ActorContentScopeService } from '../entitlements/actor-content-scope.service';
import { PrismaService } from '../prisma/prisma.service';
import type { ActivityQueryDto } from './dto/activity-query.dto';

const HISTORY_INCLUDE = {
  video: { select: { id: true, title: true, durationSecs: true, node: { select: { curriculumId: true } } } },
  document: { select: { id: true, title: true, pageCount: true, node: { select: { curriculumId: true } } } },
} as const satisfies Prisma.ResourceActivityInclude;

@Injectable()
export class HistoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contentScope: ActorContentScopeService,
  ) {}

  async history(actor: AuthenticatedUser, query: ActivityQueryDto) {
    const scope = await this.contentScope.resolveBrowse(actorScopeOf(actor));
    if (scope !== 'all' && scope.length === 0) return [];
    return this.prisma.resourceActivity.findMany({
      where: {
        userId: actor.sub,
        ...(query.type ? { resourceType: query.type } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...scopeWhere(scope),
      },
      include: HISTORY_INCLUDE,
      take: query.limit,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      orderBy: [{ lastAccessedAt: 'desc' }, { id: 'desc' }],
    });
  }

  async continueLearning(actor: AuthenticatedUser) {
    const scope = await this.contentScope.resolveBrowse(actorScopeOf(actor));
    if (scope !== 'all' && scope.length === 0) return [];
    return this.prisma.resourceActivity.findMany({
      where: { userId: actor.sub, status: ProgressStatus.IN_PROGRESS, ...scopeWhere(scope) },
      include: HISTORY_INCLUDE,
      take: 10,
      orderBy: { lastAccessedAt: 'desc' },
    });
  }
}

function scopeWhere(scope: 'all' | string[]): Prisma.ResourceActivityWhereInput {
  if (scope === 'all') return {};
  return {
    OR: [
      { video: { status: VideoStatus.READY, node: { curriculumId: { in: scope } } } },
      { document: { status: DocumentStatus.READY, node: { curriculumId: { in: scope } } } },
    ],
  };
}
