import { BadRequestException, ForbiddenException, GoneException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SchoolStatus, User, UserStatus } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { MailService } from '../mail/mail.service';
import { LoginThrottleService } from './login-throttle.service';
import { PasswordResetService } from './password-reset.service';

type UserWithSchool = User & { school: { name: string; slug: string; status: SchoolStatus } | null };

function baseUser(overrides: Partial<UserWithSchool> = {}): UserWithSchool {
  return {
    id: 'user-1',
    email: 'teacher@smartteacher.dev',
    passwordHash: 'existing-hash',
    name: 'Tom Teacher',
    role: 'TEACHER',
    status: UserStatus.ACTIVE,
    inviteTokenHash: null,
    inviteTokenExpiresAt: null,
    resetTokenHash: 'irrelevant-in-fixture',
    resetTokenExpiresAt: new Date(Date.now() + 60_000),
    activatedAt: new Date(),
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

describe('PasswordResetService', () => {
  let service: PasswordResetService;
  let prisma: {
    school: { findUnique: jest.Mock };
    user: { findUnique: jest.Mock; findFirst: jest.Mock; update: jest.Mock };
    refreshToken: { updateMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let mail: { sendPasswordReset: jest.Mock };
  let loginThrottle: {
    assertResetNotThrottled: jest.Mock;
    recordAttempt: jest.Mock;
    clearFailures: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      school: { findUnique: jest.fn() },
      user: { findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn().mockResolvedValue(undefined) },
      refreshToken: { updateMany: jest.fn().mockResolvedValue(undefined) },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    mail = { sendPasswordReset: jest.fn().mockResolvedValue(undefined) };
    loginThrottle = {
      assertResetNotThrottled: jest.fn().mockResolvedValue(undefined),
      recordAttempt: jest.fn().mockResolvedValue(undefined),
      clearFailures: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        PasswordResetService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: TenantContextService,
          useValue: { runWithSystemBypass: (fn: () => unknown) => fn() },
        },
        { provide: MailService, useValue: mail },
        { provide: LoginThrottleService, useValue: loginThrottle },
      ],
    }).compile();

    service = moduleRef.get(PasswordResetService);
  });

  describe('requestReset', () => {
    it('issues a token and emails a link for an active user resolved by schoolId_email', async () => {
      const user = baseUser();
      prisma.school.findUnique.mockResolvedValue({ id: 'school-1', status: SchoolStatus.ACTIVE });
      prisma.user.findUnique.mockResolvedValue(user);

      await service.requestReset('teacher@smartteacher.dev', '127.0.0.1', 'springfield-high');

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { schoolId_email: { schoolId: 'school-1', email: 'teacher@smartteacher.dev' } },
        include: { school: true },
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { resetTokenHash: expect.any(String), resetTokenExpiresAt: expect.any(Date) },
      });
      expect(mail.sendPasswordReset).toHaveBeenCalledWith(
        expect.objectContaining({ email: user.email, schoolName: 'Springfield High' }),
      );
    });

    it('resolves a platform user by schoolId: null when no slug is given', async () => {
      prisma.user.findFirst.mockResolvedValue(baseUser({ schoolId: null, school: null }));

      await service.requestReset('superadmin@smartteacher.dev', '127.0.0.1');

      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: { email: 'superadmin@smartteacher.dev', schoolId: null },
        include: { school: true },
      });
      expect(prisma.school.findUnique).not.toHaveBeenCalled();
    });

    it('throttles before touching the database', async () => {
      loginThrottle.assertResetNotThrottled.mockRejectedValue(new Error('too many requests'));

      await expect(service.requestReset('teacher@smartteacher.dev', '127.0.0.1')).rejects.toThrow(
        'too many requests',
      );
      expect(prisma.user.findFirst).not.toHaveBeenCalled();
      expect(prisma.school.findUnique).not.toHaveBeenCalled();
    });

    it('returns silently, without emailing, for an unknown email', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(service.requestReset('ghost@smartteacher.dev', '127.0.0.1')).resolves.toBeUndefined();
      expect(mail.sendPasswordReset).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('returns silently for a PENDING user (invites own that flow)', async () => {
      prisma.user.findFirst.mockResolvedValue(baseUser({ status: UserStatus.PENDING, schoolId: null }));

      await service.requestReset('pending@smartteacher.dev', '127.0.0.1');

      expect(mail.sendPasswordReset).not.toHaveBeenCalled();
    });

    it('returns silently for a DISABLED user', async () => {
      prisma.user.findFirst.mockResolvedValue(baseUser({ status: UserStatus.DISABLED, schoolId: null }));

      await service.requestReset('disabled@smartteacher.dev', '127.0.0.1');

      expect(mail.sendPasswordReset).not.toHaveBeenCalled();
    });

    it('returns silently for a suspended school', async () => {
      prisma.school.findUnique.mockResolvedValue({ id: 'school-1', status: SchoolStatus.SUSPENDED });
      prisma.user.findUnique.mockResolvedValue(
        baseUser({ school: { name: 'Springfield High', slug: 'springfield-high', status: SchoolStatus.SUSPENDED } }),
      );

      await service.requestReset('teacher@smartteacher.dev', '127.0.0.1', 'springfield-high');

      expect(mail.sendPasswordReset).not.toHaveBeenCalled();
    });

    it('overwrites a prior token, invalidating the earlier link', async () => {
      prisma.user.findFirst.mockResolvedValue(baseUser({ schoolId: null, resetTokenHash: 'old-hash' }));

      await service.requestReset('teacher@smartteacher.dev', '127.0.0.1');

      const call = prisma.user.update.mock.calls[0][0];
      expect(call.data.resetTokenHash).not.toEqual('old-hash');
    });
  });

  describe('resetPassword', () => {
    it('rejects an unknown or already-consumed token with 400', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.resetPassword('bogus-token', 'NewPassw0rd!')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects an expired token with 410, not 400', async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser({ resetTokenExpiresAt: new Date(Date.now() - 1000) }));

      await expect(service.resetPassword('raw-token', 'NewPassw0rd!')).rejects.toBeInstanceOf(GoneException);
    });

    it('rejects when the school is suspended', async () => {
      prisma.user.findUnique.mockResolvedValue(
        baseUser({ school: { name: 'Springfield High', slug: 'springfield-high', status: SchoolStatus.SUSPENDED } }),
      );

      await expect(service.resetPassword('raw-token', 'NewPassw0rd!')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects a password equal to the email, case-insensitively', async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser({ email: 'teacher@smartteacher.dev' }));

      await expect(service.resetPassword('raw-token', 'TEACHER@smartteacher.dev')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('clears the reset token and revokes every live refresh token in a single transaction on success', async () => {
      const user = baseUser();
      prisma.user.findUnique.mockResolvedValue(user);

      await service.resetPassword('raw-token', 'BrandNewPassw0rd!');

      expect(prisma.$transaction).toHaveBeenCalledWith([
        expect.any(Promise),
        expect.any(Promise),
      ]);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: {
          passwordHash: expect.any(String),
          plainPassword: null,
          resetTokenHash: null,
          resetTokenExpiresAt: null,
        },
      });
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', revokedAt: null },
        data: { revokedAt: expect.any(Date), revokeReason: 'PASSWORD_RESET' },
      });
    });

    it('clears the login lockout counter for the reset email on success', async () => {
      const user = baseUser();
      prisma.user.findUnique.mockResolvedValue(user);

      await service.resetPassword('raw-token', 'BrandNewPassw0rd!');

      expect(loginThrottle.clearFailures).toHaveBeenCalledWith('springfield-high:teacher@smartteacher.dev');
    });

    it('looks the token up by its sha256 hash', async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser());

      await service.resetPassword('raw-token', 'BrandNewPassw0rd!');

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { resetTokenHash: sha256('raw-token') },
        include: { school: true },
      });
    });
  });
});
