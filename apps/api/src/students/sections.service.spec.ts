import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { SectionsService } from './sections.service';

const gradeLevel = { id: 'g5', name: 'Grade 5', rank: 5 };

const actor: AuthenticatedUser = {
  sub: 'admin-1',
  email: 'admin@springfield-high.dev',
  name: 'Ada Admin',
  role: Role.SCHOOL_ADMIN,
  schoolId: 'school-1',
};

describe('SectionsService', () => {
  let service: SectionsService;
  let prisma: {
    gradeLevel: { findUnique: jest.Mock };
    section: { findMany: jest.Mock; create: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      gradeLevel: { findUnique: jest.fn() },
      section: { findMany: jest.fn(), create: jest.fn() },
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [SectionsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(SectionsService);
  });

  describe('create', () => {
    it('creates a section for an existing grade level', async () => {
      prisma.gradeLevel.findUnique.mockResolvedValue(gradeLevel);
      prisma.section.create.mockResolvedValue({
        id: 'section-1',
        name: 'A',
        gradeLevel,
        _count: { enrollments: 0 },
      });

      const result = await service.create({ gradeLevelId: 'g5', name: 'A' }, actor);

      expect(prisma.section.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: { schoolId: 'school-1', gradeLevelId: 'g5', name: 'A' } }),
      );
      expect(result).toEqual(
        expect.objectContaining({ id: 'section-1', label: 'Grade 5 - A', studentCount: 0 }),
      );
    });

    it('rejects an unknown grade level with a 404', async () => {
      prisma.gradeLevel.findUnique.mockResolvedValue(null);

      await expect(service.create({ gradeLevelId: 'missing', name: 'A' }, actor)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.section.create).not.toHaveBeenCalled();
    });

    it('maps a duplicate section name for the same grade level to a conflict', async () => {
      prisma.gradeLevel.findUnique.mockResolvedValue(gradeLevel);
      prisma.section.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: '5.0.0' }),
      );

      await expect(service.create({ gradeLevelId: 'g5', name: 'A' }, actor)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('rejects a platform user with no school', async () => {
      await expect(
        service.create({ gradeLevelId: 'g5', name: 'A' }, { ...actor, schoolId: null }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.gradeLevel.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('maps sections to their display label and active student count', async () => {
      prisma.section.findMany.mockResolvedValue([
        { id: 'section-1', name: 'A', gradeLevel, _count: { enrollments: 3 } },
      ]);

      const result = await service.findAll();

      expect(result).toEqual([
        expect.objectContaining({ id: 'section-1', label: 'Grade 5 - A', studentCount: 3 }),
      ]);
    });
  });
});
