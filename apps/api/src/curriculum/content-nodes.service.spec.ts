import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { CurriculumStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ContentNodesService } from './content-nodes.service';

const CURRICULUM_ID = 'curriculum-1';

// "Chapter -> Topic": videos hang off topics, never chapters.
const LEVELS = [
  { depth: 1, name: 'Chapter', canHoldContent: false },
  { depth: 2, name: 'Topic', canHoldContent: true },
];

function nodeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'node-1',
    curriculumId: CURRICULUM_ID,
    parentId: null,
    depth: 1,
    path: '/node-1/',
    code: 'ch-01',
    title: 'Fractions',
    description: null,
    sortOrder: 1000,
    ...overrides,
  };
}

describe('ContentNodesService', () => {
  let service: ContentNodesService;
  let prisma: {
    curriculum: { findUnique: jest.Mock };
    contentNode: {
      findUnique: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    video: { count: jest.Mock };
    document: { count: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      curriculum: {
        findUnique: jest.fn().mockResolvedValue({
          status: CurriculumStatus.DRAFT,
          schema: { levels: LEVELS },
        }),
      },
      contentNode: {
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn().mockResolvedValue(nodeRow()),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'node-new' }),
        update: jest.fn().mockResolvedValue(nodeRow({ id: 'node-new' })),
        delete: jest.fn().mockResolvedValue({ id: 'node-1' }),
      },
      video: { count: jest.fn().mockResolvedValue(0) },
      document: { count: jest.fn().mockResolvedValue(0) },
      $transaction: jest.fn((arg: unknown) =>
        typeof arg === 'function'
          ? (arg as (tx: unknown) => unknown)(prisma)
          : Promise.all(arg as unknown[]),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [ContentNodesService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(ContentNodesService);
  });

  describe('create', () => {
    const dto = { parentId: null, code: 'ch-01', title: 'Fractions' };

    it('writes the path from the generated id, so the row is reachable by subtree reads', async () => {
      await service.create(CURRICULUM_ID, dto);

      expect(prisma.contentNode.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { path: '/node-new/' } }),
      );
    });

    it('labels the node with the level name its depth resolves to', async () => {
      const created = await service.create(CURRICULUM_ID, dto);

      expect(created.levelName).toBe('Chapter');
      expect(created.canHoldContent).toBe(false);
    });

    it('nests a child under its parent and one level deeper', async () => {
      prisma.contentNode.findUnique.mockResolvedValue({
        id: 'node-1',
        curriculumId: CURRICULUM_ID,
        depth: 1,
        path: '/node-1/',
      });
      prisma.contentNode.update.mockResolvedValue(
        nodeRow({ id: 'node-new', depth: 2, path: '/node-1/node-new/', parentId: 'node-1' }),
      );

      const created = await service.create(CURRICULUM_ID, { ...dto, parentId: 'node-1' });

      expect(prisma.contentNode.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ depth: 2 }) }),
      );
      expect(created.levelName).toBe('Topic');
    });

    // The rule that makes the vocabulary binding rather than decorative.
    it("409s when the schema has no level at the requested depth", async () => {
      prisma.contentNode.findUnique.mockResolvedValue({
        id: 'node-2',
        curriculumId: CURRICULUM_ID,
        depth: 2,
        path: '/node-1/node-2/',
      });

      await expect(
        service.create(CURRICULUM_ID, { ...dto, parentId: 'node-2' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.contentNode.create).not.toHaveBeenCalled();
    });

    // A parent in another curriculum reads as missing rather than as a 403 — confirming
    // it exists elsewhere tells the caller nothing they need.
    it('404s on a parent belonging to another curriculum', async () => {
      prisma.contentNode.findUnique.mockResolvedValue({
        id: 'node-x',
        curriculumId: 'other-curriculum',
        depth: 1,
        path: '/node-x/',
      });

      await expect(
        service.create(CURRICULUM_ID, { ...dto, parentId: 'node-x' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('404s on a curriculum that does not exist', async () => {
      prisma.curriculum.findUnique.mockResolvedValue(null);

      await expect(service.create('nope', dto)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('409s on structural edits to an archived curriculum', async () => {
      prisma.curriculum.findUnique.mockResolvedValue({
        status: CurriculumStatus.ARCHIVED,
        schema: { levels: LEVELS },
      });

      await expect(service.create(CURRICULUM_ID, dto)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('move', () => {
    const chapter1 = nodeRow({ id: 'ch1', path: '/ch1/', depth: 1 });

    beforeEach(() => {
      prisma.contentNode.findUnique.mockImplementation(({ where }: { where: { id: string } }) => {
        if (where.id === 'ch1') return Promise.resolve(chapter1);
        if (where.id === 'ch2') {
          return Promise.resolve({ id: 'ch2', curriculumId: CURRICULUM_ID, depth: 1, path: '/ch2/' });
        }
        if (where.id === 'tp1') {
          return Promise.resolve({
            id: 'tp1',
            curriculumId: CURRICULUM_ID,
            depth: 2,
            path: '/ch1/tp1/',
          });
        }
        return Promise.resolve(null);
      });
    });

    it('rewrites every descendant path and depth in the same transaction as the node', async () => {
      prisma.contentNode.findMany
        // The subtree read.
        .mockResolvedValueOnce([
          { id: 'ch1', path: '/ch1/', depth: 1 },
          { id: 'tp1', path: '/ch1/tp1/', depth: 2 },
        ])
        // The moved-with-videos probe: nothing in the branch holds a video.
        .mockResolvedValueOnce([])
        // The sibling read behind sortOrder resolution.
        .mockResolvedValueOnce([]);

      await service.move('ch1', { parentId: null, position: 0 });

      expect(prisma.contentNode.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'tp1' },
          data: expect.objectContaining({ path: '/ch1/tp1/', depth: 2 }),
        }),
      );
    });

    // Re-parenting a node under its own descendant would detach the subtree from the root
    // and leave a cycle no read could terminate on.
    it('409s on a move that would put a node inside itself', async () => {
      await expect(service.move('ch1', { parentId: 'tp1', position: 0 })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    // Moving across curricula would change which schools can see the content without
    // touching a single entitlement.
    it('404s on a destination parent in another curriculum', async () => {
      prisma.contentNode.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
        Promise.resolve(
          where.id === 'ch1'
            ? chapter1
            : { id: 'foreign', curriculumId: 'other', depth: 1, path: '/foreign/' },
        ),
      );

      await expect(
        service.move('ch1', { parentId: 'foreign', position: 0 }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('409s when the relocated branch would be deeper than the schema allows', async () => {
      prisma.contentNode.findMany.mockResolvedValue([
        { id: 'ch1', path: '/ch1/', depth: 1 },
        { id: 'tp1', path: '/ch1/tp1/', depth: 2 },
      ]);

      // Moving a two-level branch under a depth-1 node needs a depth-3 level, and the
      // schema stops at 2.
      await expect(service.move('ch1', { parentId: 'ch2', position: 0 })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('409s when a node holding videos would land on a level that cannot hold content', async () => {
      // The subtree is a single topic that holds videos; moving it to the top level puts
      // it on the Chapter level, which cannot hold content.
      prisma.contentNode.findMany
        .mockResolvedValueOnce([{ id: 'tp1', path: '/ch1/tp1/', depth: 2 }])
        .mockResolvedValueOnce([{ depth: 2 }]);

      await expect(service.move('tp1', { parentId: null, position: 0 })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('404s on a node that does not exist', async () => {
      await expect(service.move('nope', { parentId: null, position: 0 })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    beforeEach(() => {
      prisma.contentNode.findUnique.mockResolvedValue({
        id: 'ch1',
        curriculumId: CURRICULUM_ID,
        path: '/ch1/',
      });
    });

    it('deletes a branch that holds no videos', async () => {
      await expect(service.remove('ch1')).resolves.toBeUndefined();
      expect(prisma.contentNode.delete).toHaveBeenCalledWith({ where: { id: 'ch1' } });
    });

    // The self-relation cascades, so without this check deleting a chapter would silently
    // destroy every video filed under its topics.
    it('409s rather than letting the cascade destroy videos further down the branch', async () => {
      prisma.video.count.mockResolvedValue(3);

      await expect(service.remove('ch1')).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.contentNode.delete).not.toHaveBeenCalled();
    });

    it('counts videos across the whole subtree, not just the node itself', async () => {
      await service.remove('ch1');

      expect(prisma.video.count).toHaveBeenCalledWith({
        where: { node: { curriculumId: CURRICULUM_ID, path: { startsWith: '/ch1/' } } },
      });
    });

    it('404s on a node that does not exist', async () => {
      prisma.contentNode.findUnique.mockResolvedValue(null);

      await expect(service.remove('nope')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
