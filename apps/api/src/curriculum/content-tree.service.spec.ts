import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ContentAudience, CurriculumStatus, Role, VideoStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ActorContentScopeService } from '../entitlements/actor-content-scope.service';
import { ContentTreeService } from './content-tree.service';
import { CurriculumAccessPolicy } from './curriculum-access.policy';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';

const TEACHER: AuthenticatedUser = {
  sub: 'u1',
  email: 'teacher@demo.test',
  name: 'Teacher',
  role: Role.TEACHER,
  schoolId: 'school-a',
};

const CURRICULUM = {
  id: 'curriculum-1',
  gradeLevelId: 'g5',
  subjectId: 'maths',
  status: CurriculumStatus.PUBLISHED,
  audience: ContentAudience.STUDENT,
  gradeLevel: { name: 'Grade 5' },
  subject: { name: 'Mathematics' },
  schema: {
    levels: [
      { depth: 1, name: 'Chapter', canHoldContent: false },
      { depth: 2, name: 'Topic', canHoldContent: true },
    ],
  },
};

// One chapter with two topics beneath it. Ordered by depth then sortOrder, which is the
// order the service relies on to attach children without a second pass.
const NODES = [
  {
    id: 'ch1',
    curriculumId: 'curriculum-1',
    parentId: null,
    depth: 1,
    path: '/ch1/',
    code: 'ch-01',
    title: 'Fractions',
    description: null,
    sortOrder: 1000,
  },
  {
    id: 'tp1',
    curriculumId: 'curriculum-1',
    parentId: 'ch1',
    depth: 2,
    path: '/ch1/tp1/',
    code: 'tp-01',
    title: 'Numerators',
    description: null,
    sortOrder: 1000,
  },
  {
    id: 'tp2',
    curriculumId: 'curriculum-1',
    parentId: 'ch1',
    depth: 2,
    path: '/ch1/tp2/',
    code: 'tp-02',
    title: 'Denominators',
    description: null,
    sortOrder: 2000,
  },
];

describe('ContentTreeService', () => {
  let service: ContentTreeService;
  let prisma: {
    curriculum: { findUnique: jest.Mock; findMany: jest.Mock };
    contentNode: { findMany: jest.Mock };
    video: { findMany: jest.Mock; groupBy: jest.Mock };
    document: { findMany: jest.Mock; groupBy: jest.Mock };
    $transaction: jest.Mock;
  };
  let contentScope: { resolve: jest.Mock; includes: jest.Mock };

  beforeEach(async () => {
    prisma = {
      curriculum: {
        findUnique: jest.fn().mockResolvedValue(CURRICULUM),
        findMany: jest.fn().mockResolvedValue([]),
      },
      contentNode: { findMany: jest.fn().mockResolvedValue(NODES) },
      video: { findMany: jest.fn().mockResolvedValue([]), groupBy: jest.fn().mockResolvedValue([]) },
      document: { findMany: jest.fn().mockResolvedValue([]), groupBy: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
    };
    contentScope = { resolve: jest.fn().mockResolvedValue(['curriculum-1']), includes: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContentTreeService,
        { provide: PrismaService, useValue: prisma },
        { provide: ActorContentScopeService, useValue: contentScope },
        {
          provide: CurriculumAccessPolicy,
          useValue: { canRead: jest.fn().mockResolvedValue(true) },
        },
      ],
    }).compile();

    service = module.get(ContentTreeService);
  });

  describe('assembly', () => {
    it('nests children under their parent in one pass', async () => {
      const tree = await service.findForAdmin('curriculum-1');

      expect(tree.nodes).toHaveLength(1);
      expect(tree.nodes[0].id).toBe('ch1');
      expect(tree.nodes[0].children.map((child) => child.id)).toEqual(['tp1', 'tp2']);
    });

    it('labels each node with the level name its depth resolves to', async () => {
      const tree = await service.findForAdmin('curriculum-1');

      expect(tree.nodes[0].levelName).toBe('Chapter');
      expect(tree.nodes[0].canHoldContent).toBe(false);
      expect(tree.nodes[0].children[0].levelName).toBe('Topic');
      expect(tree.nodes[0].children[0].canHoldContent).toBe(true);
    });

    it('files each video under the node it hangs off', async () => {
      prisma.video.findMany.mockResolvedValue([
        { id: 'v1', title: 'A', description: null, durationSecs: 60, contentNodeId: 'tp1' },
        { id: 'v2', title: 'B', description: null, durationSecs: 90, contentNodeId: 'tp2' },
      ]);

      const tree = await service.findForAdmin('curriculum-1');

      expect(tree.nodes[0].children[0].videos.map((video) => video.id)).toEqual(['v1']);
      expect(tree.nodes[0].children[1].videos.map((video) => video.id)).toEqual(['v2']);
      expect(tree.nodes[0].videos).toEqual([]);
    });

    // So a client can grey out an empty branch without walking the subtree itself.
    it('rolls deep video counts up to every ancestor', async () => {
      prisma.video.findMany.mockResolvedValue([
        { id: 'v1', title: 'A', description: null, durationSecs: 60, contentNodeId: 'tp1' },
        { id: 'v2', title: 'B', description: null, durationSecs: 90, contentNodeId: 'tp2' },
        { id: 'v3', title: 'C', description: null, durationSecs: 30, contentNodeId: 'tp2' },
      ]);

      const tree = await service.findForAdmin('curriculum-1');

      expect(tree.nodes[0].videoCountDeep).toBe(3);
      expect(tree.nodes[0].children[0].videoCountDeep).toBe(1);
      expect(tree.nodes[0].children[1].videoCountDeep).toBe(2);
    });

    it('404s on a curriculum that does not exist', async () => {
      prisma.curriculum.findUnique.mockResolvedValue(null);

      await expect(service.findForAdmin('nope')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('findVisibleTo', () => {
    // Teachers and students only ever see transcoded content, the same narrowing every
    // other school-facing video read applies.
    it('narrows videos to READY', async () => {
      await service.findVisibleTo('curriculum-1', TEACHER);

      expect(prisma.video.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: VideoStatus.READY }),
        }),
      );
    });

    it('leaves every status visible on the admin view', async () => {
      await service.findForAdmin('curriculum-1');

      expect(prisma.video.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { node: { curriculumId: 'curriculum-1' } } }),
      );
    });
  });

  describe('findAllVisibleTo', () => {
    // An unentitled school must see an empty library, never the whole platform.
    it('filters to the curricula in the actor scope', async () => {
      await service.findAllVisibleTo(TEACHER);

      expect(prisma.curriculum.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: { in: ['curriculum-1'] } } }),
      );
    });

    it('returns an empty list for a school entitled to nothing', async () => {
      contentScope.resolve.mockResolvedValue([]);
      prisma.curriculum.findMany.mockResolvedValue([]);

      await expect(service.findAllVisibleTo(TEACHER)).resolves.toEqual([]);
    });

    // 'all' is SUPER_ADMIN, who authors the library and is not narrowed by entitlement.
    it('applies no filter for the platform-wide scope', async () => {
      contentScope.resolve.mockResolvedValue('all');

      await service.findAllVisibleTo(TEACHER);

      expect(prisma.curriculum.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });
  });
});
