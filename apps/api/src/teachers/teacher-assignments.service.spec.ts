import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma, Role, SubjectStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { TeacherAssignmentsService } from './teacher-assignments.service';

const gradeLevel = { id: 'g5', name: 'Grade 5' };
const section = { id: 'section-1', name: 'A', gradeLevelId: 'g5', gradeLevel };
const subject = { id: 'subject-1', name: 'Mathematics', code: 'maths', status: SubjectStatus.ACTIVE };
const teacher = { id: 'teacher-1', role: Role.TEACHER };

const actor: AuthenticatedUser = {
  sub: 'admin-1',
  email: 'admin@springfield-high.dev',
  name: 'Ada Admin',
  role: Role.SCHOOL_ADMIN,
  schoolId: 'school-1',
};

function assignmentRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'assignment-1',
    createdAt: new Date('2026-01-01'),
    user: { id: 'teacher-1', name: 'Terry Teacher', email: 'terry@springfield-high.dev' },
    subject: { id: 'subject-1', name: 'Mathematics', code: 'maths' },
    section: { id: 'section-1', name: 'A', gradeLevel: { id: 'g5', name: 'Grade 5' } },
    gradeLevel,
    ...overrides,
  };
}

describe('TeacherAssignmentsService', () => {
  let service: TeacherAssignmentsService;
  let prisma: {
    user: { findUnique: jest.Mock };
    subject: { findUnique: jest.Mock };
    section: { findUnique: jest.Mock };
    gradeLevel: { count: jest.Mock };
    teacherAssignment: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      delete: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn() },
      subject: { findUnique: jest.fn() },
      section: { findUnique: jest.fn() },
      gradeLevel: { count: jest.fn() },
      teacherAssignment: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
      },
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [TeacherAssignmentsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(TeacherAssignmentsService);
  });

  describe('create', () => {
    it('creates a section-scoped assignment', async () => {
      prisma.user.findUnique.mockResolvedValue(teacher);
      prisma.subject.findUnique.mockResolvedValue(subject);
      prisma.section.findUnique.mockResolvedValue(section);
      prisma.teacherAssignment.findFirst.mockResolvedValue(null);
      prisma.teacherAssignment.create.mockResolvedValue(assignmentRow());

      const result = await service.create(
        { teacherId: 'teacher-1', subjectId: 'subject-1', sectionId: 'section-1' },
        actor,
      );

      expect(prisma.teacherAssignment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            schoolId: 'school-1',
            userId: 'teacher-1',
            subjectId: 'subject-1',
            sectionId: 'section-1',
            gradeLevelId: 'g5',
          },
        }),
      );
      expect(result).toEqual(expect.objectContaining({ id: 'assignment-1', sectionLabel: 'Grade 5 - A' }));
    });

    it('creates a school-wide grant with no section', async () => {
      prisma.user.findUnique.mockResolvedValue(teacher);
      prisma.subject.findUnique.mockResolvedValue(subject);
      prisma.teacherAssignment.create.mockResolvedValue(
        assignmentRow({ id: 'assignment-2', section: null, gradeLevel: null }),
      );

      const result = await service.create({ teacherId: 'teacher-1', subjectId: 'subject-1' }, actor);

      expect(prisma.section.findUnique).not.toHaveBeenCalled();
      expect(prisma.teacherAssignment.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ sectionId: null }) }),
      );
      expect(result).toEqual(
        expect.objectContaining({ sectionId: null, sectionLabel: null, gradeLevelId: null }),
      );
    });

    it('creates a grade-bearing assignment without a section', async () => {
      prisma.user.findUnique.mockResolvedValue(teacher);
      prisma.subject.findUnique.mockResolvedValue(subject);
      prisma.gradeLevel.count.mockResolvedValue(1);
      prisma.teacherAssignment.create.mockResolvedValue(
        assignmentRow({ id: 'assignment-2', section: null }),
      );

      await service.create(
        { teacherId: 'teacher-1', subjectId: 'subject-1', gradeLevelId: 'g5' },
        actor,
      );

      expect(prisma.gradeLevel.count).toHaveBeenCalledWith({ where: { id: 'g5' } });
      expect(prisma.teacherAssignment.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ gradeLevelId: 'g5' }) }),
      );
    });

    it('rejects a grade level that disagrees with the selected section', async () => {
      prisma.user.findUnique.mockResolvedValue(teacher);
      prisma.subject.findUnique.mockResolvedValue(subject);
      prisma.section.findUnique.mockResolvedValue(section);

      await expect(
        service.create(
          {
            teacherId: 'teacher-1',
            subjectId: 'subject-1',
            sectionId: 'section-1',
            gradeLevelId: 'g6',
          },
          actor,
        ),
      ).rejects.toThrow('That grade level does not match the section');
      expect(prisma.teacherAssignment.create).not.toHaveBeenCalled();
    });

    it('refuses a second teacher for a section-subject pair already staffed', async () => {
      prisma.user.findUnique.mockResolvedValue(teacher);
      prisma.subject.findUnique.mockResolvedValue(subject);
      prisma.section.findUnique.mockResolvedValue(section);
      prisma.teacherAssignment.findFirst.mockResolvedValue({
        ...assignmentRow(),
        user: { name: 'Priya Prior' },
      });

      await expect(
        service.create({ teacherId: 'teacher-1', subjectId: 'subject-1', sectionId: 'section-1' }, actor),
      ).rejects.toThrow(/Priya Prior is already assigned/);
      expect(prisma.teacherAssignment.create).not.toHaveBeenCalled();
    });

    it('maps a P2002 race on create to a conflict', async () => {
      prisma.user.findUnique.mockResolvedValue(teacher);
      prisma.subject.findUnique.mockResolvedValue(subject);
      prisma.section.findUnique.mockResolvedValue(section);
      prisma.teacherAssignment.findFirst.mockResolvedValue(null);
      prisma.teacherAssignment.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: '5.0.0' }),
      );

      await expect(
        service.create({ teacherId: 'teacher-1', subjectId: 'subject-1', sectionId: 'section-1' }, actor),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects an unknown teacher with a 404', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.create({ teacherId: 'missing', subjectId: 'subject-1' }, actor),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('folds a non-teacher user id into the same 404 as missing', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'admin-2', role: Role.SCHOOL_ADMIN });

      await expect(
        service.create({ teacherId: 'admin-2', subjectId: 'subject-1' }, actor),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects an unknown subject with a 404', async () => {
      prisma.user.findUnique.mockResolvedValue(teacher);
      prisma.subject.findUnique.mockResolvedValue(null);

      await expect(
        service.create({ teacherId: 'teacher-1', subjectId: 'missing' }, actor),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects a retired subject', async () => {
      prisma.user.findUnique.mockResolvedValue(teacher);
      prisma.subject.findUnique.mockResolvedValue({ ...subject, status: SubjectStatus.RETIRED });

      await expect(
        service.create({ teacherId: 'teacher-1', subjectId: 'subject-1' }, actor),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an unknown section with a 404', async () => {
      prisma.user.findUnique.mockResolvedValue(teacher);
      prisma.subject.findUnique.mockResolvedValue(subject);
      prisma.section.findUnique.mockResolvedValue(null);

      await expect(
        service.create({ teacherId: 'teacher-1', subjectId: 'subject-1', sectionId: 'missing' }, actor),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects a platform user with no school', async () => {
      await expect(
        service.create({ teacherId: 'teacher-1', subjectId: 'subject-1' }, { ...actor, schoolId: null }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('maps assignments to their display shape', async () => {
      prisma.teacherAssignment.findMany.mockResolvedValue([assignmentRow()]);

      const result = await service.findAll({});

      expect(result).toEqual([
        expect.objectContaining({
          id: 'assignment-1',
          teacherName: 'Terry Teacher',
          subjectCode: 'maths',
          sectionLabel: 'Grade 5 - A',
        }),
      ]);
    });

    it('filters by teacherId, sectionId and subjectId when provided', async () => {
      prisma.teacherAssignment.findMany.mockResolvedValue([]);

      await service.findAll({ teacherId: 'teacher-1', sectionId: 'section-1', subjectId: 'subject-1' });

      expect(prisma.teacherAssignment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'teacher-1', sectionId: 'section-1', subjectId: 'subject-1' },
        }),
      );
    });
  });

  describe('remove', () => {
    it('deletes an existing assignment', async () => {
      prisma.teacherAssignment.findUnique.mockResolvedValue(assignmentRow());

      await service.remove('assignment-1');

      expect(prisma.teacherAssignment.delete).toHaveBeenCalledWith({ where: { id: 'assignment-1' } });
    });

    it('rejects an unknown id with a 404', async () => {
      prisma.teacherAssignment.findUnique.mockResolvedValue(null);

      await expect(service.remove('missing')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.teacherAssignment.delete).not.toHaveBeenCalled();
    });
  });
});
