import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma, SubjectStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TaxonomyService } from './taxonomy.service';

function uniqueViolation(target: string[]): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target },
  });
}

describe('TaxonomyService', () => {
  let service: TaxonomyService;
  let prisma: {
    gradeLevel: { findMany: jest.Mock; create: jest.Mock };
    subject: { findMany: jest.Mock; create: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
    video: { count: jest.Mock };
    schoolContentEntitlement: { count: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      gradeLevel: { findMany: jest.fn(), create: jest.fn() },
      subject: { findMany: jest.fn(), create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      video: { count: jest.fn() },
      schoolContentEntitlement: { count: jest.fn() },
      $transaction: jest.fn((operations: unknown[]) => Promise.all(operations)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [TaxonomyService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(TaxonomyService);
  });

  it('lists grade levels in rank order, not creation order', async () => {
    prisma.gradeLevel.findMany.mockResolvedValue([]);

    await service.findAllGradeLevels();

    expect(prisma.gradeLevel.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { rank: 'asc' } }),
    );
  });

  it('creates a grade level', async () => {
    prisma.gradeLevel.create.mockResolvedValue({ id: 'g7', name: 'Grade 7', rank: 7 });

    await expect(service.createGradeLevel({ name: 'Grade 7', rank: 7 })).resolves.toEqual({
      id: 'g7',
      name: 'Grade 7',
      rank: 7,
    });
  });

  // name and rank are separately unique, so the caller is told which one collided.
  it('reports a duplicate grade level rank distinctly from a duplicate name', async () => {
    prisma.gradeLevel.create.mockRejectedValue(uniqueViolation(['rank']));

    await expect(service.createGradeLevel({ name: 'Grade 7', rank: 5 })).rejects.toThrow(
      /rank already exists/,
    );

    prisma.gradeLevel.create.mockRejectedValue(uniqueViolation(['name']));

    await expect(service.createGradeLevel({ name: 'Grade 5', rank: 7 })).rejects.toThrow(
      /name already exists/,
    );
  });

  it('rejects a duplicate subject code with a conflict', async () => {
    prisma.subject.create.mockRejectedValue(uniqueViolation(['code']));

    await expect(service.createSubject({ name: 'Maths', code: 'maths' })).rejects.toThrow(
      ConflictException,
    );
  });

  it('lets an unrelated database error bubble rather than mislabelling it a conflict', async () => {
    prisma.subject.create.mockRejectedValue(new Error('connection lost'));

    await expect(service.createSubject({ name: 'Maths', code: 'maths' })).rejects.toThrow(
      'connection lost',
    );
  });

  it('hides retired subjects from the canonical list every role reads', async () => {
    prisma.subject.findMany.mockResolvedValue([]);

    await service.findActiveSubjects();

    expect(prisma.subject.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: SubjectStatus.ACTIVE } }),
    );
  });

  // The admin surface is the only place a retired subject can be reactivated from, so
  // it must not inherit the active-only filter.
  it('still lists retired subjects to the admin surface', async () => {
    prisma.subject.findMany.mockResolvedValue([]);

    await service.findAllSubjects();

    expect(prisma.subject.findMany).toHaveBeenCalledWith(
      expect.not.objectContaining({ where: expect.anything() }),
    );
  });

  describe('updateSubject', () => {
    const ACTIVE = { status: SubjectStatus.ACTIVE };

    it('404s on a subject that does not exist', async () => {
      prisma.subject.findUnique.mockResolvedValue(null);

      await expect(service.updateSubject('nope', { name: 'X' })).rejects.toThrow(NotFoundException);
      expect(prisma.subject.update).not.toHaveBeenCalled();
    });

    it('renames a subject without touching its status', async () => {
      prisma.subject.findUnique.mockResolvedValue(ACTIVE);
      prisma.subject.update.mockResolvedValue({});

      await service.updateSubject('sub-1', { name: 'Maths' });

      expect(prisma.video.count).not.toHaveBeenCalled();
      expect(prisma.subject.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { name: 'Maths', status: undefined } }),
      );
    });

    it('refuses to retire a subject that still has platform videos', async () => {
      prisma.subject.findUnique.mockResolvedValue(ACTIVE);
      prisma.video.count.mockResolvedValue(1);
      prisma.schoolContentEntitlement.count.mockResolvedValue(0);

      await expect(
        service.updateSubject('sub-1', { status: SubjectStatus.RETIRED }),
      ).rejects.toThrow(ConflictException);
      expect(prisma.subject.update).not.toHaveBeenCalled();
    });

    // Pins the entitlement check to the SchoolContentEntitlement root. Expressing it as
    // subject.count({ where: { entitlements: { some: {} } } }) would pass a mock-based
    // test but throw MissingTenantContextError against a real SUPER_ADMIN request.
    it('refuses to retire a subject a school is still entitled to', async () => {
      prisma.subject.findUnique.mockResolvedValue(ACTIVE);
      prisma.video.count.mockResolvedValue(0);
      prisma.schoolContentEntitlement.count.mockResolvedValue(1);

      await expect(
        service.updateSubject('sub-1', { status: SubjectStatus.RETIRED }),
      ).rejects.toThrow(ConflictException);
      expect(prisma.schoolContentEntitlement.count).toHaveBeenCalledWith({
        where: { subjectId: 'sub-1' },
      });
      expect(prisma.subject.update).not.toHaveBeenCalled();
    });

    it('retires a subject nothing references', async () => {
      prisma.subject.findUnique.mockResolvedValue(ACTIVE);
      prisma.video.count.mockResolvedValue(0);
      prisma.schoolContentEntitlement.count.mockResolvedValue(0);
      prisma.subject.update.mockResolvedValue({ status: SubjectStatus.RETIRED });

      await service.updateSubject('sub-1', { status: SubjectStatus.RETIRED });

      expect(prisma.subject.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { name: undefined, status: SubjectStatus.RETIRED } }),
      );
    });

    // Re-retiring adds no new references, so the check would only be able to reject a
    // state the subject is already in.
    it('skips the reference check when the subject is already retired', async () => {
      prisma.subject.findUnique.mockResolvedValue({ status: SubjectStatus.RETIRED });
      prisma.subject.update.mockResolvedValue({});

      await service.updateSubject('sub-1', { status: SubjectStatus.RETIRED });

      expect(prisma.video.count).not.toHaveBeenCalled();
      expect(prisma.schoolContentEntitlement.count).not.toHaveBeenCalled();
    });

    it('reactivates a retired subject without a reference check', async () => {
      prisma.subject.findUnique.mockResolvedValue({ status: SubjectStatus.RETIRED });
      prisma.subject.update.mockResolvedValue({});

      await service.updateSubject('sub-1', { status: SubjectStatus.ACTIVE });

      expect(prisma.video.count).not.toHaveBeenCalled();
      expect(prisma.subject.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { name: undefined, status: SubjectStatus.ACTIVE } }),
      );
    });
  });
});
