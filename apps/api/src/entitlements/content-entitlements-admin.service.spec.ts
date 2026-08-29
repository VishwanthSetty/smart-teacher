import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ContentAudience, CurriculumStatus, Prisma, SubjectStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ContentEntitlementsAdminService } from './content-entitlements-admin.service';

const ROW = {
  id: 'e1',
  schoolId: 'school-a',
  curriculumId: 'c-g5-maths',
  grantedAt: new Date('2026-01-01T00:00:00Z'),
  curriculum: {
    status: CurriculumStatus.PUBLISHED,
    audience: ContentAudience.STUDENT,
    gradeLevel: { id: 'g5', name: 'Grade 5' },
    subject: { id: 'maths', name: 'Mathematics', status: SubjectStatus.ACTIVE },
  },
};

const ENTITY = {
  audience: ContentAudience.STUDENT,
  id: 'e1',
  schoolId: 'school-a',
  curriculumId: 'c-g5-maths',
  gradeLevelId: 'g5',
  gradeLevelName: 'Grade 5',
  subjectId: 'maths',
  subjectName: 'Mathematics',
  curriculumStatus: CurriculumStatus.PUBLISHED,
  grantedAt: ROW.grantedAt,
};

function curriculum(
  id: string,
  status: CurriculumStatus = CurriculumStatus.PUBLISHED,
  subjectStatus: SubjectStatus = SubjectStatus.ACTIVE,
) {
  return { id, status, subject: { status: subjectStatus } };
}

describe('ContentEntitlementsAdminService', () => {
  let service: ContentEntitlementsAdminService;
  let prisma: {
    school: { count: jest.Mock; findMany: jest.Mock };
    curriculum: { count: jest.Mock; findUnique: jest.Mock; findMany: jest.Mock };
    schoolContentEntitlement: {
      findMany: jest.Mock;
      groupBy: jest.Mock;
      create: jest.Mock;
      createMany: jest.Mock;
      deleteMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      school: { count: jest.fn().mockResolvedValue(1), findMany: jest.fn() },
      curriculum: {
        count: jest.fn(),
        findUnique: jest.fn().mockResolvedValue({
          status: CurriculumStatus.PUBLISHED,
          subject: { status: SubjectStatus.ACTIVE },
        }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      schoolContentEntitlement: {
        findMany: jest.fn(),
        groupBy: jest.fn(),
        create: jest.fn(),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      // The service passes an array of lazy Prisma promises; resolve them as given.
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [ContentEntitlementsAdminService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(ContentEntitlementsAdminService);
  });

  it("flattens the curriculum's grade level and subject names into the response", async () => {
    prisma.schoolContentEntitlement.findMany.mockResolvedValue([ROW]);

    await expect(service.listForSchool('school-a')).resolves.toEqual([ENTITY]);
  });

  it('summarizes grant coverage and audience counts for every school', async () => {
    prisma.school.findMany.mockResolvedValue([
      { id: 'school-a', name: 'Alpha', slug: 'alpha', status: 'ACTIVE' },
      { id: 'school-b', name: 'Beta', slug: 'beta', status: 'SUSPENDED' },
    ]);
    prisma.curriculum.count.mockResolvedValue(6);
    prisma.schoolContentEntitlement.groupBy.mockResolvedValue([
      { schoolId: 'school-a', _count: { _all: 2 } },
    ]);
    prisma.schoolContentEntitlement.findMany.mockResolvedValue([
      { schoolId: 'school-a', curriculum: { audience: ContentAudience.STUDENT } },
      { schoolId: 'school-a', curriculum: { audience: ContentAudience.TEACHER } },
    ]);

    await expect(service.getOverview()).resolves.toEqual({
      schools: [
        {
          schoolId: 'school-a',
          schoolName: 'Alpha',
          schoolSlug: 'alpha',
          schoolStatus: 'ACTIVE',
          studentCurricula: 1,
          teacherCurricula: 1,
          grantedCurricula: 2,
          totalCurricula: 6,
        },
        {
          schoolId: 'school-b',
          schoolName: 'Beta',
          schoolSlug: 'beta',
          schoolStatus: 'SUSPENDED',
          studentCurricula: 0,
          teacherCurricula: 0,
          grantedCurricula: 0,
          totalCurricula: 6,
        },
      ],
    });
  });

  it('404s on a school that does not exist rather than returning an empty list', async () => {
    prisma.school.count.mockResolvedValue(0);

    await expect(service.listForSchool('nope')).rejects.toThrow(NotFoundException);
    expect(prisma.schoolContentEntitlement.findMany).not.toHaveBeenCalled();
  });

  it('grants an entitlement', async () => {
    prisma.schoolContentEntitlement.create.mockResolvedValue(ROW);

    await expect(service.grant('school-a', { curriculumId: 'c-g5-maths' })).resolves.toMatchObject({
      id: 'e1',
      gradeLevelName: 'Grade 5',
    });
  });

  // Without the pre-check this surfaces as a raw foreign-key violation, i.e. a 500.
  it('404s on a nonexistent curriculum instead of letting the FK violation surface', async () => {
    prisma.curriculum.findUnique.mockResolvedValue(null);

    await expect(service.grant('school-a', { curriculumId: 'nope' })).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.schoolContentEntitlement.create).not.toHaveBeenCalled();
  });

  // 409, not 404: the subject exists and SUPER_ADMIN can see it in GET /admin/subjects.
  it('409s on a grant whose curriculum carries a retired subject', async () => {
    prisma.curriculum.findUnique.mockResolvedValue({
      status: CurriculumStatus.PUBLISHED,
      subject: { status: SubjectStatus.RETIRED },
    });

    await expect(service.grant('school-a', { curriculumId: 'c-g5-maths' })).rejects.toThrow(
      ConflictException,
    );
    expect(prisma.schoolContentEntitlement.create).not.toHaveBeenCalled();
  });

  it('409s on a grant naming an archived curriculum', async () => {
    prisma.curriculum.findUnique.mockResolvedValue({
      status: CurriculumStatus.ARCHIVED,
      subject: { status: SubjectStatus.ACTIVE },
    });

    await expect(service.grant('school-a', { curriculumId: 'c-old' })).rejects.toThrow(
      ConflictException,
    );
    expect(prisma.schoolContentEntitlement.create).not.toHaveBeenCalled();
  });

  // Granting ahead of publication is legitimate: reads filter on PUBLISHED, so nothing
  // leaks, and requiring publish-before-grant would only create a sequencing trap.
  it('allows granting a DRAFT curriculum', async () => {
    prisma.curriculum.findUnique.mockResolvedValue({
      status: CurriculumStatus.DRAFT,
      subject: { status: SubjectStatus.ACTIVE },
    });
    prisma.schoolContentEntitlement.create.mockResolvedValue(ROW);

    await expect(service.grant('school-a', { curriculumId: 'c-draft' })).resolves.toMatchObject({
      id: 'e1',
    });
  });

  it('reports a repeat grant as a conflict, not a silent no-op', async () => {
    prisma.schoolContentEntitlement.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target: ['schoolId', 'curriculumId'] },
      }),
    );

    await expect(service.grant('school-a', { curriculumId: 'c-g5-maths' })).rejects.toThrow(
      ConflictException,
    );
  });

  it('revokes an entitlement', async () => {
    prisma.schoolContentEntitlement.deleteMany.mockResolvedValue({ count: 1 });

    await expect(service.revoke('school-a', 'e1')).resolves.toBeUndefined();
  });

  // The delete is matched on school AND id, so an id belonging to another school reads
  // as missing here instead of revoking that school's grant.
  it('scopes the revoke to the named school, so a foreign entitlement id 404s', async () => {
    prisma.schoolContentEntitlement.deleteMany.mockResolvedValue({ count: 0 });

    await expect(service.revoke('school-a', 'entitlement-of-school-b')).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.schoolContentEntitlement.deleteMany).toHaveBeenCalledWith({
      where: { id: 'entitlement-of-school-b', schoolId: 'school-a' },
    });
  });

  describe('replaceForSchool', () => {
    // Shape of the currentRows read inside replaceForSchool's first transaction — distinct
    // from ENTITLEMENT_SELECT (used by the final listForSchool call), which is why the two
    // fixtures below are named differently.
  const currentRow = (
      id: string,
      curriculumId: string,
      subjectStatus: SubjectStatus = SubjectStatus.ACTIVE,
      audience: ContentAudience = ContentAudience.STUDENT,
    ) => ({ id, curriculumId, curriculum: { audience, subject: { status: subjectStatus } } });

    it('grants the additions and revokes the removals in one save', async () => {
      prisma.curriculum.findMany.mockResolvedValue([curriculum('c-g5-science')]);
      prisma.schoolContentEntitlement.findMany
        .mockResolvedValueOnce([currentRow('e1', 'c-g5-maths')]) // current rows
        .mockResolvedValueOnce([ROW]); // final listForSchool read

      const result = await service.replaceForSchool('school-a', {
        curriculumIds: ['c-g5-science'],
      });

      expect(prisma.schoolContentEntitlement.deleteMany).toHaveBeenCalledWith({
        where: { schoolId: 'school-a', id: { in: ['e1'] } },
      });
      expect(prisma.schoolContentEntitlement.createMany).toHaveBeenCalledWith({
        data: [{ schoolId: 'school-a', curriculumId: 'c-g5-science' }],
        skipDuplicates: true,
      });
      expect(result).toEqual([ENTITY]);
    });

    it('no-ops when the desired set matches what is already granted', async () => {
      prisma.curriculum.findMany.mockResolvedValue([curriculum('c-g5-maths')]);
      prisma.schoolContentEntitlement.findMany
        .mockResolvedValueOnce([currentRow('e1', 'c-g5-maths')])
        .mockResolvedValueOnce([ROW]);

      await service.replaceForSchool('school-a', { curriculumIds: ['c-g5-maths'] });

      expect(prisma.schoolContentEntitlement.deleteMany).toHaveBeenCalledWith({
        where: { schoolId: 'school-a', id: { in: [] } },
      });
      expect(prisma.schoolContentEntitlement.createMany).toHaveBeenCalledWith({
        data: [],
        skipDuplicates: true,
      });
    });

    it('revokes every active-subject grant when curriculumIds is empty', async () => {
      prisma.schoolContentEntitlement.findMany
        .mockResolvedValueOnce([currentRow('e1', 'c-g5-maths'), currentRow('e2', 'c-g6-science')])
        .mockResolvedValueOnce([]);

      await service.replaceForSchool('school-a', { curriculumIds: [] });

      expect(prisma.schoolContentEntitlement.deleteMany).toHaveBeenCalledWith({
        where: { schoolId: 'school-a', id: { in: ['e1', 'e2'] } },
      });
      expect(prisma.schoolContentEntitlement.createMany).toHaveBeenCalledWith({
        data: [],
        skipDuplicates: true,
      });
    });

    it('does not revoke grants from the other audience when saving one tab', async () => {
      prisma.schoolContentEntitlement.findMany
        .mockResolvedValueOnce([
          currentRow('student-entitlement', 'student-curriculum'),
          currentRow(
            'teacher-entitlement',
            'teacher-curriculum',
            SubjectStatus.ACTIVE,
            ContentAudience.TEACHER,
          ),
        ])
        .mockResolvedValueOnce([ROW]);

      await service.replaceForSchool('school-a', {
        curriculumIds: [],
        audience: ContentAudience.TEACHER,
      });

      expect(prisma.schoolContentEntitlement.deleteMany).toHaveBeenCalledWith({
        where: { schoolId: 'school-a', id: { in: ['teacher-entitlement'] } },
      });
    });

    // Retirement stops *new* grants; a grant already held on a since-retired subject stays
    // live until explicitly revoked. The admin UI never offers a retired subject, so this
    // entitlement can never round-trip through the desired set — the diff must not treat
    // its absence as a revoke.
    it('leaves a retired-subject entitlement untouched even though it is absent from the desired set', async () => {
      prisma.curriculum.findMany.mockResolvedValue([curriculum('c-g5-maths')]);
      prisma.schoolContentEntitlement.findMany
        .mockResolvedValueOnce([
          currentRow('e1', 'c-g5-maths'),
          currentRow('e2', 'c-retired', SubjectStatus.RETIRED),
        ])
        .mockResolvedValueOnce([ROW]);

      await service.replaceForSchool('school-a', { curriculumIds: ['c-g5-maths'] });

      expect(prisma.schoolContentEntitlement.deleteMany).toHaveBeenCalledWith({
        where: { schoolId: 'school-a', id: { in: [] } },
      });
    });

    it('404s on an unknown curriculum instead of letting the FK violation surface', async () => {
      prisma.curriculum.findMany.mockResolvedValue([]);
      prisma.schoolContentEntitlement.findMany.mockResolvedValueOnce([]);

      await expect(
        service.replaceForSchool('school-a', { curriculumIds: ['missing'] }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.schoolContentEntitlement.deleteMany).not.toHaveBeenCalled();
    });

    // 409, not 404: the curriculum exists, same as grant()'s rule — it is only a conflict
    // because this school does not already hold it.
    it('409s a curriculum whose subject is retired and is not already granted', async () => {
      prisma.curriculum.findMany.mockResolvedValue([
        curriculum('c-retired', CurriculumStatus.PUBLISHED, SubjectStatus.RETIRED),
      ]);
      prisma.schoolContentEntitlement.findMany.mockResolvedValueOnce([]);

      await expect(
        service.replaceForSchool('school-a', { curriculumIds: ['c-retired'] }),
      ).rejects.toThrow(ConflictException);
      expect(prisma.schoolContentEntitlement.deleteMany).not.toHaveBeenCalled();
    });

    it('409s an archived curriculum that is not already granted', async () => {
      prisma.curriculum.findMany.mockResolvedValue([curriculum('c-old', CurriculumStatus.ARCHIVED)]);
      prisma.schoolContentEntitlement.findMany.mockResolvedValueOnce([]);

      await expect(service.replaceForSchool('school-a', { curriculumIds: ['c-old'] })).rejects.toThrow(
        ConflictException,
      );
    });

    it('allows a retired subject to remain in the desired set when it is already granted', async () => {
      prisma.curriculum.findMany.mockResolvedValue([
        curriculum('c-retired', CurriculumStatus.PUBLISHED, SubjectStatus.RETIRED),
      ]);
      prisma.schoolContentEntitlement.findMany
        .mockResolvedValueOnce([currentRow('e1', 'c-retired', SubjectStatus.RETIRED)])
        .mockResolvedValueOnce([]);

      await expect(
        service.replaceForSchool('school-a', { curriculumIds: ['c-retired'] }),
      ).resolves.toEqual([]);
      expect(prisma.schoolContentEntitlement.deleteMany).toHaveBeenCalledWith({
        where: { schoolId: 'school-a', id: { in: [] } },
      });
    });

    it('de-dupes a repeated curriculum before diffing or granting', async () => {
      prisma.curriculum.findMany.mockResolvedValue([curriculum('c-g5-science')]);
      prisma.schoolContentEntitlement.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      await service.replaceForSchool('school-a', {
        curriculumIds: ['c-g5-science', 'c-g5-science'],
      });

      expect(prisma.schoolContentEntitlement.createMany).toHaveBeenCalledWith({
        data: [{ schoolId: 'school-a', curriculumId: 'c-g5-science' }],
        skipDuplicates: true,
      });
    });

    it('404s on a school that does not exist', async () => {
      prisma.school.count.mockResolvedValue(0);

      await expect(service.replaceForSchool('nope', { curriculumIds: [] })).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.schoolContentEntitlement.findMany).not.toHaveBeenCalled();
    });
  });
});
