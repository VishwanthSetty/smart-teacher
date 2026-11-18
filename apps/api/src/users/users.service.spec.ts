import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma, Role, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { InvitesService } from '../invites/invites.service';
import { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { UsersService } from './users.service';
import { UsersAccessPolicy } from './users-access.policy';
import { EnrollmentLookupService } from '../students/enrollment-lookup.service';
import { EnrollmentsService } from '../students/enrollments.service';

const actor: AuthenticatedUser = {
  sub: 'admin-1',
  email: 'admin@smartteacher.dev',
  name: 'Ada Admin',
  role: Role.SCHOOL_ADMIN,
  schoolId: 'school-1',
};

const school = { id: 'school-1', name: 'Springfield High', slug: 'springfield-high' };

describe('UsersService', () => {
  let service: UsersService;
  let prisma: {
    user: { findMany: jest.Mock; findUnique: jest.Mock; create: jest.Mock; count: jest.Mock };
    school: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let mail: { sendUserInvite: jest.Mock };
  let invites: { mintToken: jest.Mock };
  let enrollments: { activeProfilesFor: jest.Mock };
  let enrollmentWrites: { switchCurrent: jest.Mock };

  beforeEach(async () => {
    prisma = {
      user: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), count: jest.fn() },
      school: { findUnique: jest.fn() },
      $transaction: jest.fn((arg) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg))),
    };
    mail = { sendUserInvite: jest.fn().mockResolvedValue(undefined) };
    invites = {
      mintToken: jest.fn().mockReturnValue({
        token: 'raw-invite-token',
        tokenHash: 'hashed-invite-token',
        expiresAt: new Date('2026-08-01T00:00:00.000Z'),
      }),
    };
    enrollments = { activeProfilesFor: jest.fn().mockResolvedValue([]) };
    enrollmentWrites = { switchCurrent: jest.fn() };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        UsersAccessPolicy,
        { provide: PrismaService, useValue: prisma },
        { provide: MailService, useValue: mail },
        { provide: InvitesService, useValue: invites },
        { provide: EnrollmentLookupService, useValue: enrollments },
        { provide: EnrollmentsService, useValue: enrollmentWrites },
      ],
    }).compile();

    service = moduleRef.get(UsersService);
  });

  describe('create', () => {
    it('creates a PENDING user scoped to the actor\'s school and sends an invite', async () => {
      prisma.school.findUnique.mockResolvedValue(school);
      prisma.user.create.mockResolvedValue({
        id: 'user-2',
        email: 'newteacher@smartteacher.dev',
        name: 'New Teacher',
        role: Role.TEACHER,
        status: UserStatus.PENDING,
        activatedAt: null,
        createdAt: new Date(),
      });

      const result = await service.create(
        { email: 'newteacher@smartteacher.dev', name: 'New Teacher', role: Role.TEACHER },
        actor,
      );

      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: UserStatus.PENDING, schoolId: 'school-1' }),
        }),
      );
      expect(mail.sendUserInvite).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'newteacher@smartteacher.dev', schoolSlug: 'springfield-high' }),
      );
      expect(result.status).toEqual(UserStatus.PENDING);
    });

    it('maps a duplicate email-in-school to a ConflictException', async () => {
      prisma.school.findUnique.mockResolvedValue(school);
      prisma.user.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: '5.0.0' }),
      );

      await expect(
        service.create({ email: 'dup@smartteacher.dev', name: 'Dup', role: Role.TEACHER }, actor),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(mail.sendUserInvite).not.toHaveBeenCalled();
    });

    it('rejects a platform actor with no schoolId', async () => {
      await expect(
        service.create(
          { email: 'x@smartteacher.dev', name: 'X', role: Role.TEACHER },
          { ...actor, schoolId: null },
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException for a missing user', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.findOne('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('findOneVisibleTo', () => {
    it('returns the user when the actor reads their own record', async () => {
      const self = { id: 'admin-1', email: 'admin@smartteacher.dev', role: Role.SCHOOL_ADMIN };
      prisma.user.findUnique.mockResolvedValue(self);

      await expect(service.findOneVisibleTo('admin-1', actor)).resolves.toEqual(self);
    });

    it('returns the user when a SCHOOL_ADMIN reads someone else', async () => {
      const other = { id: 'user-9', email: 'teacher@smartteacher.dev', role: Role.TEACHER };
      prisma.user.findUnique.mockResolvedValue(other);

      await expect(service.findOneVisibleTo('user-9', actor)).resolves.toEqual(other);
    });

    it('throws NotFoundException when a non-admin reads someone else', async () => {
      const teacherActor: AuthenticatedUser = { ...actor, sub: 'teacher-1', role: Role.TEACHER };
      const other = { id: 'user-9', email: 'other@smartteacher.dev', role: Role.STUDENT };
      prisma.user.findUnique.mockResolvedValue(other);

      await expect(service.findOneVisibleTo('user-9', teacherActor)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException (not the null user) when the record is missing', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.findOneVisibleTo('missing', actor)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('getProfile', () => {
    it('joins the actor\'s school onto the token claims', async () => {
      prisma.school.findUnique.mockResolvedValue({
        id: 'school-1',
        name: 'Springfield High',
        slug: 'springfield-high',
        status: 'ACTIVE',
      });

      const profile = await service.getProfile(actor);

      expect(prisma.school.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'school-1' } }),
      );
      expect(profile).toMatchObject({
        id: 'admin-1',
        email: 'admin@smartteacher.dev',
        schoolId: 'school-1',
        school: { name: 'Springfield High' },
        enrollment: null,
      });
      expect(enrollments.activeProfilesFor).not.toHaveBeenCalled();
    });

    it('adds active enrollment context for a student actor', async () => {
      prisma.school.findUnique.mockResolvedValue({
        id: 'school-1',
        name: 'Springfield High',
        slug: 'springfield-high',
        status: 'ACTIVE',
      });
      enrollments.activeProfilesFor.mockResolvedValue([
        {
          id: 'enrollment-1',
          sectionId: 'section-1',
          rollNumber: '12',
          isCurrent: true,
          section: {
            name: 'A',
            gradeLevel: { id: 'grade-5', name: 'Grade 5', rank: 5 },
          },
        },
        {
          id: 'enrollment-2',
          sectionId: 'section-2',
          rollNumber: null,
          isCurrent: false,
          section: {
            name: 'Maths',
            gradeLevel: { id: 'grade-6', name: 'Grade 6', rank: 6 },
          },
        },
      ]);

      const profile = await service.getProfile({ ...actor, role: Role.STUDENT });

      expect(enrollments.activeProfilesFor).toHaveBeenCalledWith('admin-1');
      expect(profile.enrollment).toEqual({
        id: 'enrollment-1',
        sectionId: 'section-1',
        sectionName: 'A',
        sectionLabel: 'Grade 5 - A',
        gradeLevelId: 'grade-5',
        gradeLevelName: 'Grade 5',
        gradeLevelRank: 5,
        rollNumber: '12',
        isCurrent: true,
      });
      expect(profile.enrollments.map((enrollment) => enrollment.sectionLabel)).toEqual([
        'Grade 5 - A',
        'Grade 6 - Maths',
      ]);
    });

    it('lists no classes for a non-student actor', async () => {
      prisma.school.findUnique.mockResolvedValue(null);

      const profile = await service.getProfile(actor);

      expect(profile.enrollments).toEqual([]);
    });

    it('skips the lookup entirely for a platform actor with no school', async () => {
      const profile = await service.getProfile({ ...actor, role: Role.SUPER_ADMIN, schoolId: null });

      expect(prisma.school.findUnique).not.toHaveBeenCalled();
      expect(profile.school).toBeNull();
      expect(profile.schoolId).toBeNull();
      expect(profile.enrollment).toBeNull();
      expect(enrollments.activeProfilesFor).not.toHaveBeenCalled();
    });
  });

  describe('countMembership', () => {
    it('counts students and teachers excluding disabled accounts, and pending invites across all roles', async () => {
      prisma.user.count.mockResolvedValueOnce(12).mockResolvedValueOnce(4).mockResolvedValueOnce(2);

      await expect(service.countMembership()).resolves.toEqual({
        students: 12,
        teachers: 4,
        pendingInvites: 2,
      });

      expect(prisma.user.count).toHaveBeenNthCalledWith(1, {
        where: { role: Role.STUDENT, status: { not: UserStatus.DISABLED } },
      });
      expect(prisma.user.count).toHaveBeenNthCalledWith(2, {
        where: { role: Role.TEACHER, status: { not: UserStatus.DISABLED } },
      });
      expect(prisma.user.count).toHaveBeenNthCalledWith(3, {
        where: { status: UserStatus.PENDING },
      });
    });

    it('issues the counts as one transaction', async () => {
      prisma.user.count.mockResolvedValue(0);

      await service.countMembership();

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });
});
