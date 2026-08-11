import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ContentAudience, CurriculumStatus, Prisma, SubjectStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurriculaService } from './curricula.service';

const DETAIL_ROW = {
  id: 'curriculum-1',
  gradeLevelId: 'g5',
  subjectId: 'maths',
  schemaId: 'schema-1',
  status: CurriculumStatus.DRAFT,
  audience: ContentAudience.STUDENT,
  publishedAt: null,
  gradeLevel: { name: 'Grade 5' },
  subject: { name: 'Mathematics' },
  schema: {
    name: 'Chapter / Topic',
    levels: [
      { id: 'l1', depth: 1, name: 'Chapter', canHoldContent: false },
      { id: 'l2', depth: 2, name: 'Topic', canHoldContent: true },
    ],
  },
  _count: { nodes: 3 },
};

describe('CurriculaService', () => {
  let service: CurriculaService;
  let prisma: {
    curriculum: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    curriculumSchema: { count: jest.Mock; findUnique: jest.Mock };
    gradeLevel: { count: jest.Mock };
    subject: { findUnique: jest.Mock };
    contentNode: { findMany: jest.Mock; findFirst: jest.Mock };
    video: { count: jest.Mock; groupBy: jest.Mock };
    document: { count: jest.Mock; groupBy: jest.Mock };
    schoolContentEntitlement: { count: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      curriculum: {
        findMany: jest.fn().mockResolvedValue([DETAIL_ROW]),
        findUnique: jest.fn().mockResolvedValue(DETAIL_ROW),
        count: jest.fn().mockResolvedValue(1),
        create: jest.fn().mockResolvedValue({ id: 'curriculum-1' }),
        update: jest.fn().mockResolvedValue(DETAIL_ROW),
        delete: jest.fn().mockResolvedValue(DETAIL_ROW),
      },
      curriculumSchema: {
        count: jest.fn().mockResolvedValue(1),
        findUnique: jest.fn().mockResolvedValue({ levels: [{ depth: 1 }, { depth: 2 }] }),
      },
      gradeLevel: { count: jest.fn().mockResolvedValue(1) },
      subject: { findUnique: jest.fn().mockResolvedValue({ status: SubjectStatus.ACTIVE }) },
      contentNode: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      video: { count: jest.fn().mockResolvedValue(0), groupBy: jest.fn().mockResolvedValue([]) },
      document: { count: jest.fn().mockResolvedValue(0), groupBy: jest.fn().mockResolvedValue([]) },
      schoolContentEntitlement: { count: jest.fn().mockResolvedValue(0) },
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [CurriculaService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(CurriculaService);
  });

  it('flattens the grade level, subject and schema names into the response', async () => {
    await expect(service.findOne('curriculum-1')).resolves.toMatchObject({
      gradeLevelName: 'Grade 5',
      subjectName: 'Mathematics',
      schemaName: 'Chapter / Topic',
      nodeCount: 3,
    });
  });

  it('carries the level vocabulary on the detail view, so the builder can label its buttons', async () => {
    const detail = await service.findOne('curriculum-1');

    expect(detail.levels).toEqual([
      { id: 'l1', depth: 1, name: 'Chapter', canHoldContent: false },
      { id: 'l2', depth: 2, name: 'Topic', canHoldContent: true },
    ]);
  });

  // Video has no curriculumId, so the count folds nodes up to their curriculum. Rooting
  // it at the referencing model keeps it one grouped query rather than a count per card.
  it('rolls video counts up from content nodes to their curriculum', async () => {
    prisma.contentNode.findMany.mockResolvedValue([
      { id: 'n1', curriculumId: 'curriculum-1' },
      { id: 'n2', curriculumId: 'curriculum-1' },
    ]);
    prisma.video.groupBy.mockResolvedValue([
      { contentNodeId: 'n1', _count: { _all: 2 } },
      { contentNodeId: 'n2', _count: { _all: 3 } },
    ]);

    await expect(service.findOne('curriculum-1')).resolves.toMatchObject({ videoCount: 5 });
  });

  describe('create', () => {
    const dto = { gradeLevelId: 'g5', subjectId: 'maths', schemaId: 'schema-1' };

    it('creates a DRAFT curriculum', async () => {
      await service.create(dto);

      expect(prisma.curriculum.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: { ...dto, audience: ContentAudience.STUDENT } }),
      );
    });

    // Without the pre-checks these surface as raw foreign-key violations, i.e. 500s.
    it('404s on an unknown grade level', async () => {
      prisma.gradeLevel.count.mockResolvedValue(0);

      await expect(service.create(dto)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.curriculum.create).not.toHaveBeenCalled();
    });

    it('404s on an unknown subject', async () => {
      prisma.subject.findUnique.mockResolvedValue(null);

      await expect(service.create(dto)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('404s on an unknown schema', async () => {
      prisma.curriculumSchema.count.mockResolvedValue(0);

      await expect(service.create(dto)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('409s on a retired subject', async () => {
      prisma.subject.findUnique.mockResolvedValue({ status: SubjectStatus.RETIRED });

      await expect(service.create(dto)).rejects.toBeInstanceOf(ConflictException);
    });

    // A curriculum IS the (grade, subject) pair, so a duplicate is a conflict rather than
    // a second row.
    it('409s on a duplicate grade level and subject pair', async () => {
      prisma.curriculum.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
          meta: { target: ['gradeLevelId', 'subjectId'] },
        }),
      );

      await expect(service.create(dto)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('update', () => {
    it('swaps the schema when the existing tree still fits', async () => {
      await service.update('curriculum-1', { schemaId: 'schema-2' });

      expect(prisma.curriculum.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ schemaId: 'schema-2' }) }),
      );
    });

    // Nodes below the new vocabulary's deepest level would have no name, and no read
    // could label them.
    it('409s on a schema swap that would strand nodes below the new deepest level', async () => {
      prisma.contentNode.findFirst.mockResolvedValue({ depth: 3 });

      await expect(
        service.update('curriculum-1', { schemaId: 'schema-2' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.curriculum.update).not.toHaveBeenCalled();
    });

    // Publishing changes what schools can see, so it reads as a deliberate action rather
    // than a field on a PATCH body.
    it('409s on an attempt to publish through PATCH', async () => {
      await expect(
        service.update('curriculum-1', { status: CurriculumStatus.PUBLISHED }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('clears publishedAt when dropping back to DRAFT', async () => {
      await service.update('curriculum-1', { status: CurriculumStatus.DRAFT });

      expect(prisma.curriculum.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ publishedAt: null }) }),
      );
    });
  });

  describe('publish', () => {
    it('stamps the publication time', async () => {
      prisma.curriculum.findUnique
        .mockResolvedValueOnce({ id: 'curriculum-1', status: CurriculumStatus.DRAFT, _count: { nodes: 3 } })
        .mockResolvedValue(DETAIL_ROW);

      await service.publish('curriculum-1');

      expect(prisma.curriculum.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: CurriculumStatus.PUBLISHED }),
        }),
      );
    });

    // An entitled school would otherwise get a card that opens onto nothing, which reads
    // as broken rather than unfinished.
    it('409s on an empty tree', async () => {
      prisma.curriculum.findUnique.mockResolvedValue({
        id: 'curriculum-1',
        status: CurriculumStatus.DRAFT,
        _count: { nodes: 0 },
      });

      await expect(service.publish('curriculum-1')).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.curriculum.update).not.toHaveBeenCalled();
    });

    it('409s on an archived curriculum', async () => {
      prisma.curriculum.findUnique.mockResolvedValue({
        id: 'curriculum-1',
        status: CurriculumStatus.ARCHIVED,
        _count: { nodes: 3 },
      });

      await expect(service.publish('curriculum-1')).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('unpublish', () => {
    it('withdraws the tree and clears the publication time', async () => {
      prisma.curriculum.findUnique
        .mockResolvedValueOnce({ status: CurriculumStatus.PUBLISHED })
        .mockResolvedValue(DETAIL_ROW);

      await service.unpublish('curriculum-1');

      expect(prisma.curriculum.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: CurriculumStatus.DRAFT, publishedAt: null },
        }),
      );
    });

    it('409s on a curriculum that is not published', async () => {
      prisma.curriculum.findUnique.mockResolvedValue({ status: CurriculumStatus.DRAFT });

      await expect(service.unpublish('curriculum-1')).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('remove', () => {
    it('deletes a curriculum nothing references', async () => {
      await expect(service.remove('curriculum-1')).resolves.toBeUndefined();
      expect(prisma.curriculum.delete).toHaveBeenCalledWith({ where: { id: 'curriculum-1' } });
    });

    // Archiving is the intended path for a curriculum that has been in service; deleting
    // one schools still hold would strip their access without a revoke.
    it('409s while schools still hold entitlements', async () => {
      prisma.schoolContentEntitlement.count.mockResolvedValue(1);

      await expect(service.remove('curriculum-1')).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.curriculum.delete).not.toHaveBeenCalled();
    });

    it('409s while the tree still holds videos', async () => {
      prisma.video.count.mockResolvedValue(1);

      await expect(service.remove('curriculum-1')).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.curriculum.delete).not.toHaveBeenCalled();
    });

    it('404s on a curriculum that does not exist', async () => {
      prisma.curriculum.findUnique.mockResolvedValue(null);

      await expect(service.remove('nope')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
