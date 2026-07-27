import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma, SubjectStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ContentEntitlementsAdminService } from './content-entitlements-admin.service';

const ROW = {
  id: 'e1',
  schoolId: 'school-a',
  grantedAt: new Date('2026-01-01T00:00:00Z'),
  gradeLevel: { id: 'g5', name: 'Grade 5' },
  subject: { id: 'maths', name: 'Mathematics' },
};

describe('ContentEntitlementsAdminService', () => {
  let service: ContentEntitlementsAdminService;
  let prisma: {
    school: { count: jest.Mock };
    gradeLevel: { count: jest.Mock };
    subject: { findUnique: jest.Mock };
    schoolContentEntitlement: { findMany: jest.Mock; create: jest.Mock; deleteMany: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      school: { count: jest.fn().mockResolvedValue(1) },
      gradeLevel: { count: jest.fn().mockResolvedValue(1) },
      subject: { findUnique: jest.fn().mockResolvedValue({ status: SubjectStatus.ACTIVE }) },
      schoolContentEntitlement: { findMany: jest.fn(), create: jest.fn(), deleteMany: jest.fn() },
      // The service passes an array of lazy Prisma promises; resolve them as given.
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContentEntitlementsAdminService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(ContentEntitlementsAdminService);
  });

  it("flattens an entitlement's grade level and subject names into the response", async () => {
    prisma.schoolContentEntitlement.findMany.mockResolvedValue([ROW]);

    await expect(service.listForSchool('school-a')).resolves.toEqual([
      {
        id: 'e1',
        schoolId: 'school-a',
        gradeLevelId: 'g5',
        gradeLevelName: 'Grade 5',
        subjectId: 'maths',
        subjectName: 'Mathematics',
        grantedAt: ROW.grantedAt,
      },
    ]);
  });

  it('404s on a school that does not exist rather than returning an empty list', async () => {
    prisma.school.count.mockResolvedValue(0);

    await expect(service.listForSchool('nope')).rejects.toThrow(NotFoundException);
    expect(prisma.schoolContentEntitlement.findMany).not.toHaveBeenCalled();
  });

  it('grants an entitlement', async () => {
    prisma.schoolContentEntitlement.create.mockResolvedValue(ROW);

    await expect(
      service.grant('school-a', { gradeLevelId: 'g5', subjectId: 'maths' }),
    ).resolves.toMatchObject({ id: 'e1', gradeLevelName: 'Grade 5' });
  });

  // Without the pre-check these surface as a raw foreign-key violation, i.e. a 500.
  it('404s on a nonexistent grade level instead of letting the FK violation surface', async () => {
    prisma.gradeLevel.count.mockResolvedValue(0);

    await expect(
      service.grant('school-a', { gradeLevelId: 'g5', subjectId: 'maths' }),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.schoolContentEntitlement.create).not.toHaveBeenCalled();
  });

  it('404s on a nonexistent subject instead of letting the FK violation surface', async () => {
    prisma.subject.findUnique.mockResolvedValue(null);

    await expect(
      service.grant('school-a', { gradeLevelId: 'g5', subjectId: 'maths' }),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.schoolContentEntitlement.create).not.toHaveBeenCalled();
  });

  // 409, not 404: the subject exists and SUPER_ADMIN can see it in GET /admin/subjects.
  it('409s on a grant naming a retired subject', async () => {
    prisma.subject.findUnique.mockResolvedValue({ status: SubjectStatus.RETIRED });

    await expect(
      service.grant('school-a', { gradeLevelId: 'g5', subjectId: 'maths' }),
    ).rejects.toThrow(ConflictException);
    expect(prisma.schoolContentEntitlement.create).not.toHaveBeenCalled();
  });

  it('reports a repeat grant as a conflict, not a silent no-op', async () => {
    prisma.schoolContentEntitlement.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target: ['schoolId', 'gradeLevelId', 'subjectId'] },
      }),
    );

    await expect(
      service.grant('school-a', { gradeLevelId: 'g5', subjectId: 'maths' }),
    ).rejects.toThrow(ConflictException);
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
});
