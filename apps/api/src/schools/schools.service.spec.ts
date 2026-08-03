import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Plan, Prisma, SchoolStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { InvitesService } from '../invites/invites.service';
import { SchoolsService } from './schools.service';

const baseSchool = {
  id: 'school-1',
  name: 'Springfield High',
  slug: 'springfield-high',
  academicYear: '2025-2026',
  status: SchoolStatus.ACTIVE,
  plan: Plan.FREE,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

describe('SchoolsService', () => {
  let service: SchoolsService;
  let prisma: {
    school: {
      create: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    user: { create: jest.Mock; updateMany: jest.Mock; findFirst: jest.Mock };
    refreshToken: { updateMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let mail: { sendUserInvite: jest.Mock };
  let invites: { mintToken: jest.Mock };

  beforeEach(async () => {
    prisma = {
      school: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      user: { create: jest.fn(), updateMany: jest.fn(), findFirst: jest.fn() },
      refreshToken: { updateMany: jest.fn() },
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

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        SchoolsService,
        { provide: PrismaService, useValue: prisma },
        { provide: MailService, useValue: mail },
        { provide: InvitesService, useValue: invites },
      ],
    }).compile();

    service = moduleRef.get(SchoolsService);
  });

  it('creates a school and sends the pending admin invite', async () => {
    prisma.school.create.mockResolvedValue(baseSchool);
    prisma.user.create.mockResolvedValue({ id: 'user-1' });

    const result = await service.create({
      name: baseSchool.name,
      slug: baseSchool.slug,
      academicYear: baseSchool.academicYear,
      adminEmail: 'head@springfield.edu',
      adminName: 'Head',
    });

    expect(result).toEqual(expect.objectContaining({ id: 'school-1', slug: 'springfield-high' }));
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ role: 'SCHOOL_ADMIN', status: 'PENDING', schoolId: 'school-1' }),
      }),
    );
    expect(mail.sendUserInvite).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'head@springfield.edu', schoolSlug: 'springfield-high' }),
    );
  });

  it('maps a duplicate slug to a ConflictException', async () => {
    prisma.school.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: '5.0.0' }),
    );

    await expect(
      service.create({
        name: 'X',
        slug: 'taken',
        academicYear: '2025-2026',
        adminEmail: 'a@b.com',
        adminName: 'A',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(mail.sendUserInvite).not.toHaveBeenCalled();
  });

  it('returns paginated results with computed metadata and the primary admin email', async () => {
    prisma.school.findMany.mockResolvedValue([
      { ...baseSchool, users: [{ email: 'head@springfield.edu' }] },
    ]);
    prisma.school.count.mockResolvedValue(3);

    const result = await service.findAll({ page: 1, limit: 2 });

    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toEqual(expect.objectContaining({ adminEmail: 'head@springfield.edu' }));
    expect(result.meta).toEqual({ page: 1, limit: 2, total: 3, totalPages: 2 });
  });

  it('returns a single school with its primary admin email', async () => {
    prisma.school.findUnique.mockResolvedValue({
      ...baseSchool,
      users: [{ email: 'head@springfield.edu' }],
    });

    const result = await service.findOne('school-1');

    expect(result).toEqual(
      expect.objectContaining({ id: 'school-1', adminEmail: 'head@springfield.edu' }),
    );
    // The joined users array is a query artefact, never part of the response contract.
    expect(result).not.toHaveProperty('users');
  });

  it('throws NotFoundException when reading a missing school', async () => {
    prisma.school.findUnique.mockResolvedValue(null);

    await expect(service.findOne('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('revokes tenant refresh tokens when suspending a school', async () => {
    prisma.school.findUnique.mockResolvedValue(baseSchool);
    prisma.school.update.mockResolvedValue({ ...baseSchool, status: SchoolStatus.SUSPENDED });
    prisma.user.findFirst.mockResolvedValue({ email: 'head@springfield.edu' });

    await service.update('school-1', { status: SchoolStatus.SUSPENDED });

    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { user: { schoolId: 'school-1' }, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('throws NotFoundException when updating a missing school', async () => {
    prisma.school.findUnique.mockResolvedValue(null);

    await expect(service.update('missing', { name: 'X' })).rejects.toBeInstanceOf(NotFoundException);
  });
});
