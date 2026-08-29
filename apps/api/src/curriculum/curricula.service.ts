import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ContentAudience, CurriculumStatus, Prisma, SubjectStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaginatedCurriculaEntity } from './entities/paginated-curricula.entity';
import { CreateCurriculumDto } from './dto/create-curriculum.dto';
import { ListCurriculaQueryDto } from './dto/list-curricula-query.dto';
import { UpdateCurriculumDto } from './dto/update-curriculum.dto';
import { CurriculumDetailEntity, CurriculumEntity } from './entities/curriculum.entity';

const CURRICULUM_SELECT = {
  id: true,
  gradeLevelId: true,
  subjectId: true,
  schemaId: true,
  status: true,
  audience: true,
  publishedAt: true,
  gradeLevel: { select: { name: true } },
  subject: { select: { name: true } },
  schema: { select: { name: true } },
  _count: { select: { nodes: true } },
} as const satisfies Prisma.CurriculumSelect;

type CurriculumRow = Prisma.CurriculumGetPayload<{ select: typeof CURRICULUM_SELECT }>;

function toEntity(
  row: CurriculumRow,
  counts: { videos: number; documents: number },
): CurriculumEntity {
  return {
    audience: row.audience,
    id: row.id,
    gradeLevelId: row.gradeLevelId,
    gradeLevelName: row.gradeLevel.name,
    subjectId: row.subjectId,
    subjectName: row.subject.name,
    schemaId: row.schemaId,
    schemaName: row.schema.name,
    status: row.status,
    publishedAt: row.publishedAt,
    nodeCount: row._count.nodes,
    videoCount: counts.videos,
    documentCount: counts.documents,
  };
}

/**
 * One curriculum per (gradeLevel, subject). SUPER_ADMIN only.
 *
 * A curriculum is three things at once: the licensing unit every SchoolContentEntitlement
 * points at, the root of the content tree, and where the level vocabulary is bound. That
 * is what keeps the tree feature from touching auth — every access decision is still
 * "which curricula may this actor reach?".
 *
 * Curriculum, ContentNode and CurriculumSchema are all platform-global, but two paths
 * here count SchoolContentEntitlement — the entitled-school count on the detail view and
 * the delete guard — and that model is tenant-scoped. CurriculaAdminController therefore
 * carries @BypassTenantScope(); without it those counts throw MissingTenantContextError
 * for the SUPER_ADMIN who is the only caller.
 *
 * Both counts are rooted at SchoolContentEntitlement rather than reached through
 * Curriculum.entitlements. A relation traversal from a Curriculum root would enter the
 * tenant guard's nested walker and answer "grants in this one tenant" — the wrong
 * question for a platform-wide count.
 */
@Injectable()
export class CurriculaService {
  constructor(private readonly prisma: PrismaService) {}

  countAll(): Promise<number> {
    return this.prisma.curriculum.count();
  }

  async findAll(query: ListCurriculaQueryDto = new ListCurriculaQueryDto()): Promise<PaginatedCurriculaEntity> {
    const where: Prisma.CurriculumWhereInput = {
      ...(query.gradeLevelId ? { gradeLevelId: query.gradeLevelId } : {}),
      ...(query.subjectId ? { subjectId: query.subjectId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.audience ? { audience: query.audience } : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.curriculum.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: CURRICULUM_SELECT,
        orderBy: [{ gradeLevel: { rank: 'asc' } }, { subject: { name: 'asc' } }],
      }),
      this.prisma.curriculum.count({ where }),
    ]);

    const contentCounts = await this.contentCountsFor(rows.map((row) => row.id));

    return {
      data: rows.map((row) =>
        toEntity(row, contentCounts.get(row.id) ?? { videos: 0, documents: 0 }),
      ),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async findOne(id: string): Promise<CurriculumDetailEntity> {
    const row = await this.prisma.curriculum.findUnique({
      where: { id },
      select: {
        ...CURRICULUM_SELECT,
        schema: {
          select: {
            name: true,
            levels: {
              select: { id: true, depth: true, name: true, canHoldContent: true },
              orderBy: { depth: 'asc' },
            },
          },
        },
      },
    });
    if (row === null) {
      throw new NotFoundException('Curriculum not found');
    }

    const [contentCounts, entitledSchoolCount] = await Promise.all([
      this.contentCountsFor([row.id]),
      this.prisma.schoolContentEntitlement.count({ where: { curriculumId: row.id } }),
    ]);

    return {
      ...toEntity(row, contentCounts.get(row.id) ?? { videos: 0, documents: 0 }),
      levels: row.schema.levels,
      entitledSchoolCount,
    };
  }

  async create(dto: CreateCurriculumDto): Promise<CurriculumDetailEntity> {
    // The FKs are caller-supplied, so each must be proven to exist or Prisma's raw
    // foreign-key violation would surface as a 500.
    const [gradeLevel, subject, schema] = await this.prisma.$transaction([
      this.prisma.gradeLevel.count({ where: { id: dto.gradeLevelId } }),
      this.prisma.subject.findUnique({ where: { id: dto.subjectId }, select: { status: true } }),
      this.prisma.curriculumSchema.count({ where: { id: dto.schemaId } }),
    ]);

    if (gradeLevel === 0) {
      throw new NotFoundException('Grade level not found');
    }
    if (subject === null) {
      throw new NotFoundException('Subject not found');
    }
    if (schema === 0) {
      throw new NotFoundException('Curriculum schema not found');
    }
    if (subject.status === SubjectStatus.RETIRED) {
      throw new ConflictException('This subject is retired and cannot take new curricula');
    }

    try {
      const created = await this.prisma.curriculum.create({
        data: {
          gradeLevelId: dto.gradeLevelId,
          subjectId: dto.subjectId,
          schemaId: dto.schemaId,
          audience: dto.audience ?? ContentAudience.STUDENT,
        },
        select: { id: true },
      });
      return await this.findOne(created.id);
    } catch (error) {
      // @@unique([gradeLevelId, subjectId]) — a curriculum IS the pair, so a duplicate is
      // a conflict rather than a second row.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(
          'A curriculum already exists for that grade level, subject and audience',
        );
      }
      throw error;
    }
  }

  /**
   * Swaps the level vocabulary, or archives the curriculum.
   *
   * A schema swap is refused when the existing tree would not fit: nodes sitting below
   * the new vocabulary's deepest level would have no name, and no read could label them.
   */
  async update(id: string, dto: UpdateCurriculumDto): Promise<CurriculumDetailEntity> {
    const curriculum = await this.prisma.curriculum.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (curriculum === null) {
      throw new NotFoundException('Curriculum not found');
    }

    if (dto.status === CurriculumStatus.PUBLISHED) {
      throw new ConflictException('Use the publish endpoint to publish a curriculum');
    }

    if (dto.schemaId !== undefined) {
      const schema = await this.prisma.curriculumSchema.findUnique({
        where: { id: dto.schemaId },
        select: { levels: { select: { depth: true } } },
      });
      if (schema === null) {
        throw new NotFoundException('Curriculum schema not found');
      }
      const maxDepth = schema.levels.reduce((deepest, level) => Math.max(deepest, level.depth), 0);
      const deepestNode = await this.prisma.contentNode.findFirst({
        where: { curriculumId: id, depth: { gt: maxDepth } },
        select: { depth: true },
        orderBy: { depth: 'desc' },
      });
      if (deepestNode !== null) {
        throw new ConflictException(
          `This curriculum has nodes at level ${deepestNode.depth}, deeper than the new schema allows`,
        );
      }
    }

    await this.prisma.curriculum.update({
      where: { id },
      data: {
        schemaId: dto.schemaId,
        status: dto.status,
        // Dropping back to DRAFT clears the publication timestamp: leaving a stale one
        // would read as "published on ..." for something no school can see.
        ...(dto.status === CurriculumStatus.DRAFT ? { publishedAt: null } : {}),
      },
    });

    return this.findOne(id);
  }

  /** Makes the tree visible to every school that holds a grant. */
  async publish(id: string): Promise<CurriculumDetailEntity> {
    const curriculum = await this.prisma.curriculum.findUnique({
      where: { id },
      select: { id: true, status: true, _count: { select: { nodes: true } } },
    });
    if (curriculum === null) {
      throw new NotFoundException('Curriculum not found');
    }
    if (curriculum.status === CurriculumStatus.ARCHIVED) {
      throw new ConflictException('An archived curriculum cannot be published');
    }
    // Publishing an empty tree would show entitled schools a curriculum card that opens
    // onto nothing, which reads as a broken product rather than an unfinished one.
    if (curriculum._count.nodes === 0) {
      throw new ConflictException('A curriculum needs at least one node before it can be published');
    }

    await this.prisma.curriculum.update({
      where: { id },
      data: { status: CurriculumStatus.PUBLISHED, publishedAt: new Date() },
    });

    return this.findOne(id);
  }

  /** Withdraws the tree from every school immediately. The escape hatch for a bad publish. */
  async unpublish(id: string): Promise<CurriculumDetailEntity> {
    const curriculum = await this.prisma.curriculum.findUnique({
      where: { id },
      select: { status: true },
    });
    if (curriculum === null) {
      throw new NotFoundException('Curriculum not found');
    }
    if (curriculum.status !== CurriculumStatus.PUBLISHED) {
      throw new ConflictException('This curriculum is not published');
    }

    await this.prisma.curriculum.update({
      where: { id },
      data: { status: CurriculumStatus.DRAFT, publishedAt: null },
    });

    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    const curriculum = await this.prisma.curriculum.findUnique({
      where: { id },
      select: { id: true },
    });
    if (curriculum === null) {
      throw new NotFoundException('Curriculum not found');
    }

    // Both FKs are onDelete: Restrict, so this would fail at the database anyway.
    // Checking here names which of the two blocked it, and archiving is the intended
    // path for a curriculum that has been in service.
    const [entitlementCount, videoCount, documentCount] = await this.prisma.$transaction([
      this.prisma.schoolContentEntitlement.count({ where: { curriculumId: id } }),
      this.prisma.video.count({ where: { node: { curriculumId: id } } }),
      this.prisma.document.count({ where: { node: { curriculumId: id } } }),
    ]);
    if (entitlementCount > 0) {
      throw new ConflictException('Schools still hold entitlements for this curriculum; archive it instead');
    }
    if (videoCount > 0) {
      throw new ConflictException('This curriculum still holds videos; archive it instead');
    }
    if (documentCount > 0) {
      throw new ConflictException('This curriculum still holds documents; archive it instead');
    }

    // ContentNode cascades from Curriculum, so the (now video-free) tree goes with it.
    await this.prisma.curriculum.delete({ where: { id } });
  }

  /**
   * Video counts per curriculum in one grouped query.
   *
   * Video has no curriculumId of its own, so this groups by content node and folds the
   * nodes up to their curriculum — cheaper than a per-curriculum count in a loop, which
   * is what a page of 50 curricula would otherwise cost.
   */
  private async contentCountsFor(
    curriculumIds: readonly string[],
  ): Promise<Map<string, { videos: number; documents: number }>> {
    if (curriculumIds.length === 0) {
      return new Map();
    }

    const nodes = await this.prisma.contentNode.findMany({
      where: { curriculumId: { in: [...curriculumIds] } },
      select: { id: true, curriculumId: true },
    });
    if (nodes.length === 0) {
      return new Map();
    }

    const [groupedVideos, groupedDocuments] = await Promise.all([
      this.prisma.video.groupBy({
        by: ['contentNodeId'],
        where: { contentNodeId: { in: nodes.map((node) => node.id) } },
        _count: { _all: true },
      }),
      this.prisma.document.groupBy({
        by: ['contentNodeId'],
        where: { contentNodeId: { in: nodes.map((node) => node.id) } },
        _count: { _all: true },
      }),
    ]);

    const curriculumByNode = new Map(nodes.map((node) => [node.id, node.curriculumId]));
    const counts = new Map<string, { videos: number; documents: number }>();
    for (const group of groupedVideos) {
      const curriculumId = curriculumByNode.get(group.contentNodeId);
      if (curriculumId !== undefined) {
        const current = counts.get(curriculumId) ?? { videos: 0, documents: 0 };
        counts.set(curriculumId, { ...current, videos: current.videos + group._count._all });
      }
    }
    for (const group of groupedDocuments) {
      const curriculumId = curriculumByNode.get(group.contentNodeId);
      if (curriculumId !== undefined) {
        const current = counts.get(curriculumId) ?? { videos: 0, documents: 0 };
        counts.set(curriculumId, { ...current, documents: current.documents + group._count._all });
      }
    }
    return counts;
  }
}
