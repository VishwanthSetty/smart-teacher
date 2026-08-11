import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CurriculumStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildPath,
  isSelfOrDescendant,
  nextSortOrder,
  respace,
  rewritePathPrefix,
  ROOT_PATH,
  sortOrderForPosition,
} from './content-node-path.util';
import { CreateContentNodeDto } from './dto/create-content-node.dto';
import { MoveContentNodeDto } from './dto/move-content-node.dto';
import { UpdateContentNodeDto } from './dto/update-content-node.dto';
import { ContentNodeEntity } from './entities/content-node.entity';

const NODE_SELECT = {
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

type NodeRow = Prisma.ContentNodeGetPayload<{ select: typeof NODE_SELECT }>;

interface SchemaLevel {
  depth: number;
  name: string;
  canHoldContent: boolean;
}

/**
 * Every mutation of the curriculum tree. SUPER_ADMIN only.
 *
 * Two invariants are maintained here and nowhere else, which is why structural edits go
 * through this service rather than a generic update:
 *
 *   - `depth` always names a level the curriculum's schema actually declares, so no node
 *     can exist below the vocabulary that labels it.
 *   - `path` always spells out the node's true ancestry, so a subtree read is one indexed
 *     prefix match. A move rewrites every descendant's path in the same transaction as
 *     the node's own — a half-rewritten tree would silently detach a branch.
 */
@Injectable()
export class ContentNodesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(curriculumId: string, dto: CreateContentNodeDto): Promise<ContentNodeEntity> {
    const { levels } = await this.requireEditableCurriculum(curriculumId);

    const parent =
      dto.parentId === null
        ? null
        : await this.prisma.contentNode.findUnique({
            where: { id: dto.parentId },
            select: { id: true, curriculumId: true, depth: true, path: true },
          });

    if (dto.parentId !== null) {
      // A parent from another curriculum reads as missing rather than as a 403: it is not
      // reachable from this curriculum, and confirming it exists elsewhere tells the
      // caller nothing they need.
      if (parent === null || parent.curriculumId !== curriculumId) {
        throw new NotFoundException('Parent node not found');
      }
    }

    const depth = parent === null ? 1 : parent.depth + 1;
    const level = levelAt(levels, depth);
    if (level === undefined) {
      throw new ConflictException("This curriculum's schema has no level at that depth");
    }

    const siblings = await this.prisma.contentNode.findMany({
      where: { curriculumId, parentId: dto.parentId },
      select: { sortOrder: true },
    });

    // The path derives from the generated id, so the row must exist before the path does.
    // Both writes go in one transaction — the same pattern VideosService.create uses for
    // sourceKey — because a node with a placeholder path would be invisible to every
    // subtree read.
    const created = await this.prisma
      .$transaction(async (tx) => {
        const row = await tx.contentNode.create({
          data: {
            curriculumId,
            parentId: dto.parentId,
            depth,
            path: ROOT_PATH,
            code: dto.code,
            title: dto.title,
            description: dto.description,
            sortOrder: nextSortOrder(siblings.map((sibling) => sibling.sortOrder)),
          },
          select: { id: true },
        });

        return tx.contentNode.update({
          where: { id: row.id },
          data: { path: buildPath(parent?.path ?? ROOT_PATH, row.id) },
          select: NODE_SELECT,
        });
      })
      .catch((error: unknown) => {
        throw translateCodeConflict(error);
      });

    return toEntity(created, levels);
  }

  async update(id: string, dto: UpdateContentNodeDto): Promise<ContentNodeEntity> {
    const node = await this.prisma.contentNode.findUnique({
      where: { id },
      select: { curriculumId: true },
    });
    if (node === null) {
      throw new NotFoundException('Content node not found');
    }
    const { levels } = await this.requireEditableCurriculum(node.curriculumId);

    const updated = await this.prisma.contentNode
      .update({
        where: { id },
        data: { code: dto.code, title: dto.title, description: dto.description },
        select: NODE_SELECT,
      })
      .catch((error: unknown) => {
        throw translateCodeConflict(error);
      });

    return toEntity(updated, levels);
  }

  /**
   * Reparents and reorders a node, carrying its whole subtree with it.
   *
   * Four things are checked before anything is written, because each one produces a tree
   * that no later read could make sense of:
   *
   *   1. the destination is in the same curriculum — moving across curricula would change
   *      which schools can see the content without touching a single entitlement;
   *   2. the destination is not inside the moving subtree — that would make the node its
   *      own ancestor and leave a cycle;
   *   3. the relocated subtree still fits the schema's depth;
   *   4. no node in it that holds videos lands on a level that cannot hold content.
   */
  async move(id: string, dto: MoveContentNodeDto): Promise<ContentNodeEntity> {
    const node = await this.prisma.contentNode.findUnique({ where: { id }, select: NODE_SELECT });
    if (node === null) {
      throw new NotFoundException('Content node not found');
    }
    const { levels } = await this.requireEditableCurriculum(node.curriculumId);

    const parent =
      dto.parentId === null
        ? null
        : await this.prisma.contentNode.findUnique({
            where: { id: dto.parentId },
            select: { id: true, curriculumId: true, depth: true, path: true },
          });

    if (dto.parentId !== null) {
      if (parent === null || parent.curriculumId !== node.curriculumId) {
        throw new NotFoundException('Parent node not found');
      }
      if (isSelfOrDescendant(node.path, parent.path)) {
        throw new ConflictException('A node cannot be moved inside itself');
      }
    }

    const newDepth = parent === null ? 1 : parent.depth + 1;
    const depthDelta = newDepth - node.depth;

    // Includes the node itself — its path is a prefix of itself — so one query covers the
    // whole subtree and the node's own rewrite.
    const subtree = await this.prisma.contentNode.findMany({
      where: { curriculumId: node.curriculumId, path: { startsWith: node.path } },
      select: { id: true, path: true, depth: true },
    });

    const deepest = subtree.reduce((max, member) => Math.max(max, member.depth), node.depth);
    if (levelAt(levels, deepest + depthDelta) === undefined) {
      throw new ConflictException(
        "The moved branch would be deeper than this curriculum's schema allows",
      );
    }

    // A node holding videos must land somewhere that may hold them. Checking the whole
    // subtree, not just the moved node: a chapter dragged one level down takes its topics
    // with it, and those are the rows that actually carry the videos.
    const movedWithContent = await this.prisma.contentNode.findMany({
      where: {
        id: { in: subtree.map((member) => member.id) },
        OR: [{ videos: { some: {} } }, { documents: { some: {} } }],
      },
      select: { depth: true },
    });
    const blocked = movedWithContent.find(
      (member) => levelAt(levels, member.depth + depthDelta)?.canHoldContent !== true,
    );
    if (blocked !== undefined) {
      throw new ConflictException(
        'The moved branch holds content at a level that cannot hold content',
      );
    }

    const newPath = buildPath(parent?.path ?? ROOT_PATH, node.id);
    const sortOrder = await this.resolveSortOrder(node, dto);

    await this.prisma.$transaction([
      this.prisma.contentNode.update({
        where: { id: node.id },
        data: { parentId: dto.parentId, depth: newDepth, path: newPath, sortOrder },
      }),
      // Every descendant, one update each. O(subtree) writes on a rare admin action is the
      // deliberate cost of not reaching for a recursive CTE, which would need $queryRaw
      // and an entry in raw-sql-guard.spec.ts's allow-list.
      ...subtree
        .filter((member) => member.id !== node.id)
        .map((member) =>
          this.prisma.contentNode.update({
            where: { id: member.id },
            data: {
              path: rewritePathPrefix(member.path, node.path, newPath),
              depth: member.depth + depthDelta,
            },
          }),
        ),
    ]);

    const moved = await this.prisma.contentNode.findUniqueOrThrow({
      where: { id: node.id },
      select: NODE_SELECT,
    });
    return toEntity(moved, levels);
  }

  async remove(id: string): Promise<void> {
    const node = await this.prisma.contentNode.findUnique({
      where: { id },
      select: { id: true, curriculumId: true, path: true },
    });
    if (node === null) {
      throw new NotFoundException('Content node not found');
    }
    await this.requireEditableCurriculum(node.curriculumId);

    // ContentNode cascades down its self-relation, so deleting a branch takes its
    // descendants silently. Refusing while any of them holds a video is what stops that
    // cascade from destroying content an operator did not know was down there.
    const [videoCount, documentCount] = await this.prisma.$transaction([
      this.prisma.video.count({
        where: { node: { curriculumId: node.curriculumId, path: { startsWith: node.path } } },
      }),
      this.prisma.document.count({
        where: { node: { curriculumId: node.curriculumId, path: { startsWith: node.path } } },
      }),
    ]);
    if (videoCount > 0 || documentCount > 0) {
      throw new ConflictException('This branch still holds content and cannot be deleted');
    }

    await this.prisma.contentNode.delete({ where: { id } });
  }

  /**
   * The sortOrder that lands the node at the requested position.
   *
   * Midpoint insertion leaves every sibling untouched. When the gap between two siblings
   * is exhausted the midpoint collides, and the whole sibling set is re-spaced first —
   * rare, and bounded by one parent's child count.
   */
  private async resolveSortOrder(node: NodeRow, dto: MoveContentNodeDto): Promise<number> {
    const siblings = await this.prisma.contentNode.findMany({
      where: { curriculumId: node.curriculumId, parentId: dto.parentId, id: { not: node.id } },
      select: { id: true, sortOrder: true },
      orderBy: { sortOrder: 'asc' },
    });

    const direct = sortOrderForPosition(
      siblings.map((sibling) => sibling.sortOrder),
      dto.position,
    );
    if (direct !== null) {
      return direct;
    }

    const spaced = respace(siblings.length);
    await this.prisma.$transaction(
      siblings.map((sibling, index) =>
        this.prisma.contentNode.update({
          where: { id: sibling.id },
          data: { sortOrder: spaced[index] },
        }),
      ),
    );

    const retry = sortOrderForPosition(spaced, dto.position);
    // respace() spreads siblings a full gap apart, so a midpoint always exists.
    return retry ?? nextSortOrder(spaced);
  }

  /**
   * Loads the curriculum's level vocabulary and refuses structural edits to an archived
   * one — archival retires a curriculum from authoring, and letting its shape drift
   * afterwards would break that promise for the schools still reading it.
   */
  private async requireEditableCurriculum(
    curriculumId: string,
  ): Promise<{ levels: SchemaLevel[] }> {
    const curriculum = await this.prisma.curriculum.findUnique({
      where: { id: curriculumId },
      select: {
        status: true,
        schema: {
          select: { levels: { select: { depth: true, name: true, canHoldContent: true } } },
        },
      },
    });
    if (curriculum === null) {
      throw new NotFoundException('Curriculum not found');
    }
    if (curriculum.status === CurriculumStatus.ARCHIVED) {
      throw new ConflictException('An archived curriculum cannot be edited');
    }
    return { levels: curriculum.schema.levels };
  }
}

function levelAt(levels: readonly SchemaLevel[], depth: number): SchemaLevel | undefined {
  return levels.find((level) => level.depth === depth);
}

export function toEntity(row: NodeRow, levels: readonly SchemaLevel[]): ContentNodeEntity {
  const level = levelAt(levels, row.depth);
  return {
    id: row.id,
    curriculumId: row.curriculumId,
    parentId: row.parentId,
    depth: row.depth,
    // A node can only be created at a declared depth and UpdateCurriculumSchemaDto
    // refuses to drop an occupied one, so this fallback is unreachable — it exists so a
    // corrupted row renders as an unnamed level rather than crashing every tree read.
    levelName: level?.name ?? `Level ${row.depth}`,
    canHoldContent: level?.canHoldContent ?? false,
    code: row.code,
    title: row.title,
    description: row.description,
    sortOrder: row.sortOrder,
  };
}

function translateCodeConflict(error: unknown): unknown {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    return new ConflictException('A node with this code already exists in this curriculum');
  }
  return error;
}
