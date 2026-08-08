import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma, Role, UserStatus, EnrollmentStatus, RefreshTokenRevokeReason } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { PasswordsService } from '../passwords/passwords.service';
import { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { StudentsService } from './students.service';
import { EnrollmentsService } from './enrollments.service';

const school = { id: 'school-1', name: 'Springfield High', slug: 'springfield-high' };
const section1 = { id: 'section-1', schoolId: 'school-1', gradeLevelId: 'g5', name: 'A' };
const section2 = { id: 'section-2', schoolId: 'school-1', gradeLevelId: 'g6', name: 'A' };

const actor: AuthenticatedUser = {
  sub: 'admin-1',
  email: 'admin@springfield-high.dev',
  name: 'Ada Admin',
  role: Role.SCHOOL_ADMIN,
  schoolId: 'school-1',
};

function enrollmentFixture(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'enrollment-1',
    schoolId: 'school-1',
    userId: 'student-1',
    sectionId: section1.id,
    rollNumber: '1',
    status: EnrollmentStatus.ACTIVE,
    startedAt: new Date('2026-07-01T00:00:00.000Z'),
    endedAt: null,
    section: { ...section1, gradeLevel: { id: 'g5', name: 'Grade 5', rank: 5 } },
    ...overrides,
  };
}

const baseUser = {
  id: 'student-1',
  email: 'asha.rao@example.com',
  name: 'Asha Rao',
  firstName: 'Asha',
  lastName: 'Rao',
  role: Role.STUDENT,
  status: UserStatus.ACTIVE,
  activatedAt: new Date(),
  createdAt: new Date('2026-07-01T00:00:00.000Z'),
  schoolId: 'school-1',
};

describe('StudentsService', () => {
  let service: StudentsService;
  let prisma: {
    school: { findUnique: jest.Mock };
    section: { findUnique: jest.Mock };
    user: { create: jest.Mock; findUnique: jest.Mock; findMany: jest.Mock; count: jest.Mock; update: jest.Mock };
    refreshToken: { updateMany: jest.Mock };
    enrollment: { update: jest.Mock };
    $transaction: jest.Mock;
  };
  let mail: { sendCredentials: jest.Mock };
  let passwords: { resolve: jest.Mock };
  let enrollments: { enroll: jest.Mock; endActive: jest.Mock; activeGradeLevelIdFor: jest.Mock };

  beforeEach(async () => {
    prisma = {
      school: { findUnique: jest.fn() },
      section: { findUnique: jest.fn() },
      user: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn(), update: jest.fn() },
      refreshToken: { updateMany: jest.fn() },
      enrollment: { update: jest.fn() },
      $transaction: jest.fn((arg) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg))),
    };
    mail = { sendCredentials: jest.fn().mockResolvedValue(undefined) };
    passwords = { resolve: jest.fn().mockResolvedValue({ password: 'Teal-Fox-7412', passwordHash: 'hash' }) };
    enrollments = { enroll: jest.fn(), endActive: jest.fn(), activeGradeLevelIdFor: jest.fn() };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        StudentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: MailService, useValue: mail },
        { provide: PasswordsService, useValue: passwords },
        { provide: EnrollmentsService, useValue: enrollments },
      ],
    }).compile();

    service = moduleRef.get(StudentsService);
  });

  describe('create', () => {
    const dto = {
      firstName: 'Asha',
      lastName: 'Rao',
      email: 'asha.rao@example.com',
      rollNumber: '1',
      sectionId: section1.id,
    };

    it('creates the user and enrollment on one transaction', async () => {
      prisma.school.findUnique.mockResolvedValue(school);
      prisma.section.findUnique.mockResolvedValue(section1);
      prisma.user.create.mockResolvedValue(baseUser);
      enrollments.enroll.mockResolvedValue(enrollmentFixture());

      const result = await service.create(dto, actor);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            role: Role.STUDENT,
            status: UserStatus.ACTIVE,
            schoolId: 'school-1',
            firstName: 'Asha',
            lastName: 'Rao',
            name: 'Asha Rao',
          }),
        }),
      );
      expect(enrollments.enroll).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({ schoolId: 'school-1', userId: 'student-1', sectionId: section1.id, rollNumber: '1' }),
      );
      expect(result).toEqual(
        expect.objectContaining({
          id: 'student-1',
          status: UserStatus.ACTIVE,
          enrollment: expect.objectContaining({ sectionId: section1.id, rollNumber: '1' }),
        }),
      );
    });

    it('creates a student without an enrollment when no section is supplied', async () => {
      prisma.school.findUnique.mockResolvedValue(school);
      prisma.user.create.mockResolvedValue(baseUser);

      const result = await service.create(
        { firstName: dto.firstName, lastName: dto.lastName, email: dto.email },
        actor,
      );

      expect(prisma.section.findUnique).not.toHaveBeenCalled();
      expect(enrollments.enroll).not.toHaveBeenCalled();
      expect(result.enrollment).toBeNull();
    });

    it('rejects a roll number when no section is supplied', async () => {
      prisma.school.findUnique.mockResolvedValue(school);

      await expect(
        service.create(
          { firstName: dto.firstName, lastName: dto.lastName, email: dto.email, rollNumber: '1' },
          actor,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('sends credentials only after the transaction commits when requested', async () => {
      prisma.school.findUnique.mockResolvedValue(school);
      prisma.section.findUnique.mockResolvedValue(section1);
      prisma.user.create.mockResolvedValue(baseUser);
      enrollments.enroll.mockImplementation(async () => {
        expect(mail.sendCredentials).not.toHaveBeenCalled();
        return enrollmentFixture();
      });

      await service.create({ ...dto, sendCredentialsEmail: true }, actor);

      expect(mail.sendCredentials).toHaveBeenCalledWith(
        expect.objectContaining({ email: dto.email, role: Role.STUDENT, schoolSlug: school.slug }),
      );
    });

    it('rejects a section from another school with a 404', async () => {
      prisma.school.findUnique.mockResolvedValue(school);
      // The tenant guard already scopes this read, so a cross-tenant id resolves to null.
      prisma.section.findUnique.mockResolvedValue(null);

      await expect(service.create(dto, actor)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects a platform user with no school', async () => {
      await expect(service.create(dto, { ...actor, schoolId: null })).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('maps a duplicate roll number to a conflict', async () => {
      prisma.school.findUnique.mockResolvedValue(school);
      prisma.section.findUnique.mockResolvedValue(section1);
      prisma.user.create.mockResolvedValue(baseUser);
      enrollments.enroll.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', {
          code: 'P2002',
          clientVersion: '5.0.0',
          meta: { target: ['sectionId', 'rollNumber'] },
        }),
      );

      await expect(service.create(dto, actor)).rejects.toBeInstanceOf(ConflictException);
      expect(mail.sendCredentials).not.toHaveBeenCalled();
    });

    it('maps a duplicate email to a conflict', async () => {
      prisma.school.findUnique.mockResolvedValue(school);
      prisma.section.findUnique.mockResolvedValue(section1);
      prisma.user.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', {
          code: 'P2002',
          clientVersion: '5.0.0',
          meta: { target: ['schoolId', 'email'] },
        }),
      );

      await expect(service.create(dto, actor)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('update', () => {
    it('ends the previous enrollment when the section changes', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...baseUser, status: UserStatus.ACTIVE, enrollments: [enrollmentFixture()] });
      prisma.section.findUnique.mockResolvedValue(section2);
      prisma.user.update.mockResolvedValue({ ...baseUser, status: UserStatus.ACTIVE });
      enrollments.enroll.mockResolvedValue(
        enrollmentFixture({ id: 'enrollment-2', sectionId: section2.id, section: { ...section2, gradeLevel: { id: 'g6', name: 'Grade 6', rank: 6 } } }),
      );

      const result = await service.update('student-1', { sectionId: section2.id });

      expect(enrollments.endActive).toHaveBeenCalledWith(prisma, 'student-1');
      expect(enrollments.enroll).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({ userId: 'student-1', sectionId: section2.id }),
      );
      expect(result.enrollment).toEqual(expect.objectContaining({ sectionId: section2.id }));
    });

    it('leaves enrollment history intact when a student is deactivated', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...baseUser, status: UserStatus.ACTIVE, enrollments: [enrollmentFixture()] });
      prisma.user.update.mockResolvedValue({ ...baseUser, status: UserStatus.DISABLED });

      await service.update('student-1', { status: UserStatus.DISABLED });

      expect(enrollments.endActive).not.toHaveBeenCalled();
      expect(enrollments.enroll).not.toHaveBeenCalled();
    });

    it('revokes live refresh tokens when a student is deactivated', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...baseUser, status: UserStatus.ACTIVE, enrollments: [enrollmentFixture()] });
      prisma.user.update.mockResolvedValue({ ...baseUser, status: UserStatus.DISABLED });

      await service.update('student-1', { status: UserStatus.DISABLED });

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'student-1', revokedAt: null },
        data: { revokedAt: expect.any(Date), revokeReason: RefreshTokenRevokeReason.LOGGED_OUT },
      });
    });

    it('throws NotFoundException for a missing student', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.update('missing', { firstName: 'X' })).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException rather than confirm a non-student user exists', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...baseUser, role: Role.TEACHER, enrollments: [] });

      await expect(service.update('student-1', { firstName: 'X' })).rejects.toBeInstanceOf(NotFoundException);
    });

    it('maps a duplicate roll number to a conflict', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...baseUser, status: UserStatus.ACTIVE, enrollments: [enrollmentFixture()] });
      prisma.user.update.mockResolvedValue({ ...baseUser, status: UserStatus.ACTIVE });
      prisma.enrollment.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', {
          code: 'P2002',
          clientVersion: '5.0.0',
          meta: { target: ['sectionId', 'rollNumber'] },
        }),
      );

      await expect(service.update('student-1', { rollNumber: '2' })).rejects.toBeInstanceOf(ConflictException);
    });
  });

  it('revokes live sessions when an admin resets a password', async () => {
    prisma.user.findUnique.mockResolvedValue({ role: Role.STUDENT, email: baseUser.email });
    await service.setPassword(baseUser.id, 'Coral-Otter-4821');
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: baseUser.id, revokedAt: null },
        data: expect.objectContaining({ revokeReason: RefreshTokenRevokeReason.PASSWORD_RESET }),
      }),
    );
  });
});
