import { BadRequestException, ConflictException, ForbiddenException, GoneException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Role, SchoolStatus, User, UserStatus } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { MailService } from '../mail/mail.service';
import { InvitesService } from './invites.service';

type UserWithSchool = User & { school: { name: string; slug: string; status: SchoolStatus } | null };

function baseUser(overrides: Partial<UserWithSchool> = {}): UserWithSchool {
  return {
    id: 'user-1',
    email: 'teacher@smartteacher.dev',
    passwordHash: null,
    name: 'Tom Teacher',
    role: Role.TEACHER,
    status: UserStatus.PENDING,
    inviteTokenHash: 'irrelevant-in-fixture',
    inviteTokenExpiresAt: new Date(Date.now() + 60_000),
    resetTokenHash: null,
    resetTokenExpiresAt: null,
    activatedAt: null,
    schoolId: 'school-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    school: { name: 'Springfield High', slug: 'springfield-high', status: SchoolStatus.ACTIVE },
    ...overrides,
  } as UserWithSchool;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

describe('InvitesService', () => {
  let service: InvitesService;
  let prisma: { user: { findUnique: jest.Mock; update: jest.Mock } };
  let mail: { sendUserInvite: jest.Mock };

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn(), update: jest.fn() },
    };
    mail = { sendUserInvite: jest.fn().mockResolvedValue(undefined) };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        InvitesService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: TenantContextService,
          useValue: { runWithSystemBypass: (fn: () => unknown) => fn() },
        },
        { provide: MailService, useValue: mail },
      ],
    }).compile();

    service = moduleRef.get(InvitesService);
  });

  describe('mintToken', () => {
    it('mints a high-entropy token whose sha256 hash is the stored hash', () => {
      const material = service.mintToken();

      expect(material.token).toHaveLength(64);
      expect(material.tokenHash).toEqual(sha256(material.token));
      expect(material.expiresAt.getTime()).toBeGreaterThan(Date.now() + 6 * 24 * 60 * 60 * 1000);
    });
  });

  describe('redeem', () => {
    it('activates the user and clears the invite fields on a valid token', async () => {
      const user = baseUser();
      prisma.user.findUnique.mockResolvedValue(user);

      await service.redeem('raw-token', 'new-password');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: expect.objectContaining({
          status: UserStatus.ACTIVE,
          activatedAt: expect.any(Date),
          inviteTokenHash: null,
          inviteTokenExpiresAt: null,
        }),
      });
    });

    it('rejects an unknown token', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.redeem('bogus-token', 'new-password')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a token for a user that is not PENDING (already activated or reused)', async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser({ status: UserStatus.ACTIVE }));

      await expect(service.redeem('raw-token', 'new-password')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects with 410 Gone when the token has expired', async () => {
      prisma.user.findUnique.mockResolvedValue(
        baseUser({ inviteTokenExpiresAt: new Date(Date.now() - 1000) }),
      );

      await expect(service.redeem('raw-token', 'new-password')).rejects.toBeInstanceOf(GoneException);
    });

    it('rejects when the school is suspended', async () => {
      prisma.user.findUnique.mockResolvedValue(
        baseUser({ school: { name: 'Springfield High', slug: 'springfield-high', status: SchoolStatus.SUSPENDED } }),
      );

      await expect(service.redeem('raw-token', 'new-password')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects a password equal to the email, case-insensitively', async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser({ email: 'teacher@smartteacher.dev' }));

      await expect(service.redeem('raw-token', 'TEACHER@smartteacher.dev')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('preview', () => {
    it('returns only the identity details needed by the activation screen', async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser());

      await expect(service.preview('raw-token')).resolves.toEqual({
        name: 'Tom Teacher',
        email: 'teacher@smartteacher.dev',
        schoolName: 'Springfield High',
      });
    });

    it('rejects expired preview links with 410', async () => {
      prisma.user.findUnique.mockResolvedValue(
        baseUser({ inviteTokenExpiresAt: new Date(Date.now() - 1000) }),
      );

      await expect(service.preview('raw-token')).rejects.toBeInstanceOf(GoneException);
    });
  });

  describe('resendForUser', () => {
    it('mints a new invite, overwrites the old hash, and re-sends the mail', async () => {
      const user = baseUser();
      prisma.user.findUnique.mockResolvedValue(user);

      await service.resendForUser('user-1');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: expect.objectContaining({
          inviteTokenHash: expect.any(String),
          inviteTokenExpiresAt: expect.any(Date),
        }),
      });
      expect(mail.sendUserInvite).toHaveBeenCalledWith(
        expect.objectContaining({ email: user.email, schoolSlug: 'springfield-high' }),
      );
    });

    it('throws NotFoundException for a missing user', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.resendForUser('missing')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ConflictException when the user has already activated', async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser({ status: UserStatus.ACTIVE }));

      await expect(service.resendForUser('user-1')).rejects.toBeInstanceOf(ConflictException);
      expect(mail.sendUserInvite).not.toHaveBeenCalled();
    });
  });
});
