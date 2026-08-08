import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma, Role, SubjectStatus, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { PasswordsService } from '../passwords/passwords.service';
import { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { TeachersService } from './teachers.service';

const school = { id: 'school-1', name: 'Springfield High', slug: 'springfield-high' };
const maths = { id: 'subject-1', code: 'MATHS', name: 'Mathematics', status: SubjectStatus.ACTIVE };
const science = { id: 'subject-2', code: 'SCI', name: 'Science', status: SubjectStatus.ACTIVE };

const actor: AuthenticatedUser = {
  sub: 'admin-1',
  email: 'admin@springfield-high.dev',
  name: 'Ada Admin',
  role: Role.SCHOOL_ADMIN,
  schoolId: 'school-1',
};

const baseUser = {
  id: 'teacher-1',
  email: 'priya.nair@example.com',
  name: 'Priya Nair',
  firstName: 'Priya',
  lastName: 'Nair',
  role: Role.TEACHER,
  status: UserStatus.ACTIVE,
  activatedAt: new Date(),
  createdAt: new Date('2026-07-01T00:00:00.000Z'),
  schoolId: 'school-1',
};

describe('TeachersService', () => {
  let service: TeachersService;
  let prisma: {
    school: { findUnique: jest.Mock };
    subject: { findMany: jest.Mock };
    user: { create: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
    refreshToken: { updateMany: jest.Mock };
    teacherAssignment: { createMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let mail: { sendCredentials: jest.Mock };
  let passwords: { resolve: jest.Mock };

  beforeEach(async () => {
    prisma = {
      school: { findUnique: jest.fn() },
      subject: { findMany: jest.fn() },
      user: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      refreshToken: { updateMany: jest.fn() },
      teacherAssignment: { createMany: jest.fn() },
      $transaction: jest.fn((arg) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg))),
    };
    mail = { sendCredentials: jest.fn().mockResolvedValue(undefined) };
    passwords = { resolve: jest.fn().mockResolvedValue({ password: 'Teal-Fox-7412', passwordHash: 'hash' }) };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        TeachersService,
        { provide: PrismaService, useValue: prisma },
        { provide: MailService, useValue: mail },
        { provide: PasswordsService, useValue: passwords },
      ],
    }).compile();

    service = moduleRef.get(TeachersService);
  });

  describe('create', () => {
    const dto = { firstName: 'Priya', lastName: 'Nair', email: 'priya.nair@example.com' };

    it('creates an ACTIVE teacher with no assignments when no subjects are given', async () => {
      prisma.school.findUnique.mockResolvedValue(school);
      prisma.subject.findMany.mockResolvedValue([]);
      prisma.user.create.mockResolvedValue(baseUser);

      const result = await service.create(dto, actor);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            role: Role.TEACHER,
            status: UserStatus.ACTIVE,
            schoolId: 'school-1',
            name: 'Priya Nair',
          }),
        }),
      );
      expect(prisma.teacherAssignment.createMany).not.toHaveBeenCalled();
      expect(result).toEqual(expect.objectContaining({ id: 'teacher-1', subjects: [] }));
    });

    it('creates school-wide assignments for the given subjects', async () => {
      prisma.school.findUnique.mockResolvedValue(school);
      prisma.subject.findMany.mockResolvedValue([maths, science]);
      prisma.user.create.mockResolvedValue(baseUser);

      const result = await service.create({ ...dto, subjectIds: [maths.id, science.id] }, actor);

      expect(prisma.teacherAssignment.createMany).toHaveBeenCalledWith({
        data: [
          { schoolId: 'school-1', userId: 'teacher-1', subjectId: maths.id },
          { schoolId: 'school-1', userId: 'teacher-1', subjectId: science.id },
        ],
      });
      expect(result.subjects).toEqual([
        { id: maths.id, name: maths.name, code: maths.code },
        { id: science.id, name: science.name, code: science.code },
      ]);
    });

    it('sends credentials only after the transaction commits when requested', async () => {
      prisma.school.findUnique.mockResolvedValue(school);
      prisma.subject.findMany.mockResolvedValue([]);
      prisma.user.create.mockImplementation(async () => {
        expect(mail.sendCredentials).not.toHaveBeenCalled();
        return baseUser;
      });

      await service.create({ ...dto, sendCredentialsEmail: true }, actor);

      expect(mail.sendCredentials).toHaveBeenCalledWith(
        expect.objectContaining({ email: dto.email, role: Role.TEACHER, schoolSlug: school.slug }),
      );
    });

    it('rejects a subject id from outside the canonical list with a 404', async () => {
      prisma.school.findUnique.mockResolvedValue(school);
      prisma.subject.findMany.mockResolvedValue([maths]);

      await expect(service.create({ ...dto, subjectIds: [maths.id, 'missing'] }, actor)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects a retired subject', async () => {
      prisma.school.findUnique.mockResolvedValue(school);
      prisma.subject.findMany.mockResolvedValue([{ ...maths, status: SubjectStatus.RETIRED }]);

      await expect(service.create({ ...dto, subjectIds: [maths.id] }, actor)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects a platform user with no school', async () => {
      await expect(service.create(dto, { ...actor, schoolId: null })).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('maps a duplicate email to a conflict', async () => {
      prisma.school.findUnique.mockResolvedValue(school);
      prisma.subject.findMany.mockResolvedValue([]);
      prisma.user.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', {
          code: 'P2002',
          clientVersion: '5.0.0',
          meta: { target: ['schoolId', 'email'] },
        }),
      );

      await expect(service.create(dto, actor)).rejects.toBeInstanceOf(ConflictException);
      expect(mail.sendCredentials).not.toHaveBeenCalled();
    });
  });

  it('revokes live sessions when an admin resets a password', async () => {
    prisma.user.findUnique.mockResolvedValue({ role: Role.TEACHER, email: baseUser.email });
    await service.setPassword(baseUser.id, 'Coral-Otter-4821');
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: baseUser.id },
      data: { passwordHash: 'hash', plainPassword: 'Teal-Fox-7412' },
    });
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: baseUser.id, revokedAt: null },
        data: expect.objectContaining({ revokeReason: 'PASSWORD_RESET' }),
      }),
    );
  });
});
