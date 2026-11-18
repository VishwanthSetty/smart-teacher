import { Injectable } from '@nestjs/common';
import {
  DocumentStatus,
  Prisma,
  ProgressStatus,
  ResourceType,
  VideoStatus,
} from '@prisma/client';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { actorScopeOf } from '../common/authorization/resource-access';
import { ActorContentScopeService } from '../entitlements/actor-content-scope.service';
import { PrismaService } from '../prisma/prisma.service';
import type { LibrarySearchQueryDto } from './dto/library-search-query.dto';

@Injectable()
export class LibrarySearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contentScope: ActorContentScopeService,
  ) {}

  async search(query: LibrarySearchQueryDto, actor: AuthenticatedUser) {
    const scope = await this.contentScope.resolveBrowse(actorScopeOf(actor));
    if (scope !== 'all' && scope.length === 0) return [];
    const term = query.q?.trim();
    const curriculum = {
      ...(scope === 'all' ? {} : { id: { in: scope } }),
      ...(query.gradeLevelId ? { gradeLevelId: query.gradeLevelId } : {}),
      ...(query.subjectId ? { subjectId: query.subjectId } : {}),
      ...(query.audience ? { audience: query.audience } : {}),
    } satisfies Prisma.CurriculumWhereInput;
    const node = {
      ...(query.contentNodeId ? { id: query.contentNodeId } : {}),
      curriculum,
      ...(term
        ? {
            OR: [
              { title: { contains: term, mode: Prisma.QueryMode.insensitive } },
              { description: { contains: term, mode: Prisma.QueryMode.insensitive } },
            ],
          }
        : {}),
    } satisfies Prisma.ContentNodeWhereInput;
    const progressFilter = activityFilter(query.progress, actor.sub);
    const [videos, documents] = await Promise.all([
      query.type === ResourceType.DOCUMENT
        ? Promise.resolve([])
        : this.prisma.video.findMany({
            where: {
              status: VideoStatus.READY,
              node,
              ...(term
                ? {
                    OR: [
                      { title: { contains: term, mode: Prisma.QueryMode.insensitive } },
                      { description: { contains: term, mode: Prisma.QueryMode.insensitive } },
                      { node },
                    ],
                  }
                : {}),
              ...(progressFilter ? { resourceActivities: progressFilter } : {}),
            },
            take: 20,
            select: {
              id: true,
              title: true,
              description: true,
              durationSecs: true,
              node: { select: { title: true, curriculumId: true } },
            },
          }),
      query.type === ResourceType.VIDEO
        ? Promise.resolve([])
        : this.prisma.document.findMany({
            where: {
              status: DocumentStatus.READY,
              node,
              ...(term
                ? {
                    OR: [
                      { title: { contains: term, mode: Prisma.QueryMode.insensitive } },
                      { description: { contains: term, mode: Prisma.QueryMode.insensitive } },
                      { node },
                    ],
                  }
                : {}),
              ...(progressFilter ? { resourceActivities: progressFilter } : {}),
            },
            take: 20,
            select: {
              id: true,
              title: true,
              description: true,
              pageCount: true,
              node: { select: { title: true, curriculumId: true } },
            },
          }),
    ]);
    return [
      ...videos.map((video) => ({ ...video, resourceType: ResourceType.VIDEO })),
      ...documents.map((document) => ({ ...document, resourceType: ResourceType.DOCUMENT })),
    ]
      .filter((item) => !query.cursor || item.id > query.cursor)
      .sort((a, b) => a.title.localeCompare(b.title))
      .slice(0, 20);
  }
}

function activityFilter(
  status: ProgressStatus | undefined,
  userId: string,
): Prisma.ResourceActivityListRelationFilter | undefined {
  if (!status) return undefined;
  if (status === ProgressStatus.NOT_STARTED) return { none: { userId } };
  return { some: { userId, status } };
}
