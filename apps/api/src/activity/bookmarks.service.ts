import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ResourceType, Role } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { actorScopeOf, requireReadable } from '../common/authorization/resource-access';
import { DocumentsService } from '../documents/documents.service';
import { ActorContentScopeService } from '../entitlements/actor-content-scope.service';
import { PrismaService } from '../prisma/prisma.service';
import { VideosService } from '../videos/videos.service';
import { ActivityAccessPolicy } from './activity-access.policy';
import type { CreateBookmarkDto } from './dto/bookmark.dto';

@Injectable()
export class BookmarksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly videos: VideosService,
    private readonly documents: DocumentsService,
    private readonly contentScope: ActorContentScopeService,
    private readonly accessPolicy: ActivityAccessPolicy,
  ) {}

  async list(actor: AuthenticatedUser) {
    const scope = await this.contentScope.resolveBrowse(actorScopeOf(actor));
    if (scope !== 'all' && scope.length === 0) return [];
    return this.prisma.bookmark.findMany({
      where: {
        userId: actor.sub,
        ...(scope === 'all'
          ? {}
          : {
              OR: [
                { video: { node: { curriculumId: { in: scope } } } },
                { document: { node: { curriculumId: { in: scope } } } },
              ],
            }),
      },
      include: {
        video: { select: { id: true, title: true, durationSecs: true } },
        document: { select: { id: true, title: true, pageCount: true } },
        collection: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(dto: CreateBookmarkDto, actor: AuthenticatedUser) {
    if (!actor.schoolId) throw new NotFoundException('School not found');
    if (dto.resourceType === ResourceType.VIDEO) {
      await this.videos.findOneVisibleTo(dto.resourceId, actor);
    } else {
      await this.documents.findOneVisibleTo(dto.resourceId, actor);
    }
    if (dto.collectionId) {
      if (actor.role !== Role.TEACHER) {
        throw new BadRequestException('Only teachers can file bookmarks into collections');
      }
      const collection = await this.prisma.collection.findFirst({
        where: { id: dto.collectionId, ownerId: actor.sub },
      });
      if (!collection) throw new NotFoundException('Collection not found');
    }
    const where =
      dto.resourceType === ResourceType.VIDEO
        ? { userId_videoId: { userId: actor.sub, videoId: dto.resourceId } }
        : { userId_documentId: { userId: actor.sub, documentId: dto.resourceId } };
    return this.prisma.bookmark.upsert({
      where,
      create: {
        schoolId: actor.schoolId,
        userId: actor.sub,
        resourceType: dto.resourceType,
        videoId: dto.resourceType === ResourceType.VIDEO ? dto.resourceId : null,
        documentId: dto.resourceType === ResourceType.DOCUMENT ? dto.resourceId : null,
        collectionId: dto.collectionId ?? null,
      },
      update: { collectionId: dto.collectionId ?? undefined },
    });
  }

  async remove(id: string, actor: AuthenticatedUser): Promise<void> {
    const bookmark = await this.prisma.bookmark.findUnique({ where: { id } });
    await requireReadable(bookmark, actorScopeOf(actor), this.accessPolicy, 'Bookmark not found');
    await this.prisma.bookmark.delete({ where: { id } });
  }

  async move(
    collectionId: string,
    bookmarkId: string,
    actor: AuthenticatedUser,
    isAdding: boolean,
  ) {
    const [collection, bookmark] = await Promise.all([
      this.prisma.collection.findUnique({ where: { id: collectionId } }),
      this.prisma.bookmark.findUnique({ where: { id: bookmarkId } }),
    ]);
    await requireReadable(collection, actorScopeOf(actor), this.accessPolicy, 'Collection not found');
    await requireReadable(bookmark, actorScopeOf(actor), this.accessPolicy, 'Bookmark not found');
    if (!isAdding && bookmark?.collectionId !== collectionId) {
      throw new NotFoundException('Bookmark not found in collection');
    }
    return this.prisma.bookmark.update({
      where: { id: bookmarkId },
      data: { collectionId: isAdding ? collectionId : null },
    });
  }
}
