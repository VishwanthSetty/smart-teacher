import { Injectable, NotFoundException } from '@nestjs/common';
import { ContentAudience, DocumentStatus, Prisma, VideoStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ActorContentScopeService } from '../entitlements/actor-content-scope.service';
import { actorScopeOf, requireReadable } from '../common/authorization/resource-access';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { CurriculumAccessPolicy } from './curriculum-access.policy';
import { CurriculumEntity } from './entities/curriculum.entity';
import {
  ContentTreeEntity,
  ContentTreeDocumentEntity,
  ContentTreeNodeEntity,
  ContentTreeVideoEntity,
} from './entities/content-tree.entity';

const TREE_NODE_SELECT = {
  id: true,
  curriculumId: true,
  parentId: true,
  depth: true,
  path: true,
  code: true,
  title: true,
  description: true,
  sortOrder: true,
} as const satisfies Prisma.ContentNodeSelect;

type TreeNodeRow = Prisma.ContentNodeGetPayload<{ select: typeof TREE_NODE_SELECT }>;

interface SchemaLevel {
  depth: number;
  name: string;
  canHoldContent: boolean;
}

/**
 * Assembles a curriculum's tree for reading — both the SUPER_ADMIN builder view and the
 * school-facing browse view.
 *
 * The whole tree is fetched flat and nested in memory rather than walked level by level:
 * a curriculum's node count is bounded by what a human authored, so one indexed query
 * plus an O(n) assembly beats a query per level. Because the tree carries no tenant data
 * at all — only *which* curricula an actor may open is tenant-dependent — the result is
 * safely cacheable per curriculum, which the flat read keeps easy.
 */
@Injectable()
export class ContentTreeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contentScope: ActorContentScopeService,
    private readonly curriculumAccessPolicy: CurriculumAccessPolicy,
  ) {}

  /** The builder view: every node, every video, whatever the publication state. */
  async findForAdmin(curriculumId: string): Promise<ContentTreeEntity> {
    const curriculum = await this.loadCurriculum(curriculumId);
    if (curriculum === null) {
      throw new NotFoundException('Curriculum not found');
    }
    return this.assemble(curriculum, { readyContentOnly: false });
  }

  /**
   * The school-facing view.
   *
   * One fetch, then the policy decides — a curriculum the caller isn't entitled to is
   * indistinguishable from one that doesn't exist. Unpublished curricula never enter the
   * actor's scope, so a DRAFT tree 404s here for the same reason an unentitled one does.
   */
  async findVisibleTo(curriculumId: string, actor: AuthenticatedUser): Promise<ContentTreeEntity> {
    const curriculum = await this.loadCurriculum(curriculumId);
    await requireReadable(
      curriculum === null ? null : { id: curriculum.id },
      actorScopeOf(actor),
      this.curriculumAccessPolicy,
      'Curriculum not found',
    );
    // requireReadable throws when the row is null, so reaching here means it is not.
    if (curriculum === null) {
      throw new NotFoundException('Curriculum not found');
    }
    // Students and teachers only ever see transcoded content, the same READY narrowing
    // every other school-facing video read applies.
    return this.assemble(curriculum, { readyContentOnly: true });
  }

  /** The curriculum cards a school-facing user may open. */
  async findAllVisibleTo(
    actor: AuthenticatedUser,
    audience?: ContentAudience,
  ): Promise<CurriculumEntity[]> {
    const scope = await this.contentScope.resolveBrowse(actorScopeOf(actor));

    const rows = await this.prisma.curriculum.findMany({
      // 'all' is SUPER_ADMIN, who authors the library and is not narrowed by entitlement.
      where: {
        ...(scope === 'all' ? {} : { id: { in: scope } }),
        ...(audience ? { audience } : {}),
      },
      select: {
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
      },
      orderBy: [{ gradeLevel: { rank: 'asc' } }, { subject: { name: 'asc' } }],
    });

    if (rows.length === 0) {
      return [];
    }

    // One grouped count for the whole page rather than a count per card.
    const nodes = await this.prisma.contentNode.findMany({
      where: { curriculumId: { in: rows.map((row) => row.id) } },
      select: { id: true, curriculumId: true },
    });
    const grouped =
      nodes.length === 0
        ? []
        : await this.prisma.video.groupBy({
            by: ['contentNodeId'],
            where: { contentNodeId: { in: nodes.map((node) => node.id) }, status: VideoStatus.READY },
            _count: { _all: true },
          });
    const groupedDocuments =
      nodes.length === 0
        ? []
        : await this.prisma.document.groupBy({
            by: ['contentNodeId'],
            where: {
              contentNodeId: { in: nodes.map((node) => node.id) },
              status: DocumentStatus.READY,
            },
            _count: { _all: true },
          });
    const curriculumByNode = new Map(nodes.map((node) => [node.id, node.curriculumId]));
    const videoCounts = new Map<string, number>();
    const documentCounts = new Map<string, number>();
    for (const group of grouped) {
      const curriculumId = curriculumByNode.get(group.contentNodeId);
      if (curriculumId !== undefined) {
        videoCounts.set(curriculumId, (videoCounts.get(curriculumId) ?? 0) + group._count._all);
      }
    }
    for (const group of groupedDocuments) {
      const curriculumId = curriculumByNode.get(group.contentNodeId);
      if (curriculumId !== undefined) {
        documentCounts.set(curriculumId, (documentCounts.get(curriculumId) ?? 0) + group._count._all);
      }
    }

    return rows.map((row) => ({
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
      videoCount: videoCounts.get(row.id) ?? 0,
      documentCount: documentCounts.get(row.id) ?? 0,
    }));
  }

  private loadCurriculum(id: string) {
    return this.prisma.curriculum.findUnique({
      where: { id },
      select: {
        id: true,
        gradeLevelId: true,
        subjectId: true,
        status: true,
        audience: true,
        gradeLevel: { select: { name: true } },
        subject: { select: { name: true } },
        schema: {
          select: { levels: { select: { depth: true, name: true, canHoldContent: true } } },
        },
      },
    });
  }

  private async assemble(
    curriculum: NonNullable<Awaited<ReturnType<ContentTreeService['loadCurriculum']>>>,
    options: { readyContentOnly: boolean },
  ): Promise<ContentTreeEntity> {
    const [nodes, videos, documents] = await this.prisma.$transaction([
      this.prisma.contentNode.findMany({
        where: { curriculumId: curriculum.id },
        select: TREE_NODE_SELECT,
        orderBy: [{ depth: 'asc' }, { sortOrder: 'asc' }],
      }),
      this.prisma.video.findMany({
        where: {
          node: { curriculumId: curriculum.id },
          ...(options.readyContentOnly ? { status: VideoStatus.READY } : {}),
        },
        select: {
          id: true,
          title: true,
          description: true,
          durationSecs: true,
          status: true,
          contentNodeId: true,
        },
        orderBy: { title: 'asc' },
      }),
      this.prisma.document.findMany({
        where: {
          node: { curriculumId: curriculum.id },
          ...(options.readyContentOnly ? { status: DocumentStatus.READY } : {}),
        },
        select: {
          id: true,
          title: true,
          description: true,
          status: true,
          contentNodeId: true,
        },
        orderBy: { title: 'asc' },
      }),
    ]);

    const videosByNode = new Map<string, ContentTreeVideoEntity[]>();
    for (const video of videos) {
      const bucket = videosByNode.get(video.contentNodeId) ?? [];
      bucket.push({
        id: video.id,
        title: video.title,
        description: video.description,
        durationSecs: video.durationSecs,
        ...(options.readyContentOnly ? {} : { status: video.status }),
      });
      videosByNode.set(video.contentNodeId, bucket);
    }

    const documentsByNode = new Map<string, ContentTreeDocumentEntity[]>();
    for (const document of documents) {
      const bucket = documentsByNode.get(document.contentNodeId) ?? [];
      bucket.push({
        id: document.id,
        title: document.title,
        description: document.description,
        ...(options.readyContentOnly ? {} : { status: document.status }),
      });
      documentsByNode.set(document.contentNodeId, bucket);
    }

    return {
      audience: curriculum.audience,
      curriculumId: curriculum.id,
      gradeLevelId: curriculum.gradeLevelId,
      gradeLevelName: curriculum.gradeLevel.name,
      subjectId: curriculum.subjectId,
      subjectName: curriculum.subject.name,
      status: curriculum.status,
      nodes: nest(nodes, curriculum.schema.levels, videosByNode, documentsByNode),
    };
  }
}

/**
 * Flat rows -> nested tree, in one pass.
 *
 * Rows arrive ordered by depth then sortOrder, so a node's parent is always constructed
 * before the node itself — which is what lets children be attached without a second pass
 * or a recursive lookup.
 */
function nest(
  rows: readonly TreeNodeRow[],
  levels: readonly SchemaLevel[],
  videosByNode: ReadonlyMap<string, ContentTreeVideoEntity[]>,
  documentsByNode: ReadonlyMap<string, ContentTreeDocumentEntity[]>,
): ContentTreeNodeEntity[] {
  const byId = new Map<string, ContentTreeNodeEntity>();
  const roots: ContentTreeNodeEntity[] = [];

  for (const row of rows) {
    const level = levels.find((candidate) => candidate.depth === row.depth);
    const videos = videosByNode.get(row.id) ?? [];
    const documents = documentsByNode.get(row.id) ?? [];
    const node: ContentTreeNodeEntity = {
      id: row.id,
      curriculumId: row.curriculumId,
      parentId: row.parentId,
      depth: row.depth,
      levelName: level?.name ?? `Level ${row.depth}`,
      canHoldContent: level?.canHoldContent ?? false,
      code: row.code,
      title: row.title,
      description: row.description,
      sortOrder: row.sortOrder,
      children: [],
      videos,
      documents,
      videoCountDeep: videos.length,
      documentCountDeep: documents.length,
    };
    byId.set(row.id, node);

    const parent = row.parentId === null ? undefined : byId.get(row.parentId);
    if (parent === undefined) {
      roots.push(node);
    } else {
      parent.children.push(node);
    }
  }

  // Deep counts roll up, so they must be computed after every child is attached. Walking
  // the rows in reverse gives children before parents without recursion.
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const node = byId.get(rows[index].id);
    if (node === undefined || node.parentId === null) {
      continue;
    }
    const parent = byId.get(node.parentId);
    if (parent !== undefined) {
      parent.videoCountDeep += node.videoCountDeep;
      parent.documentCountDeep += node.documentCountDeep;
    }
  }

  return roots;
}
