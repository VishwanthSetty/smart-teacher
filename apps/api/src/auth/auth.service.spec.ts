import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { RefreshToken, SchoolStatus, User, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { AuthService, DISABLED_ACCOUNT_MESSAGE, SUSPENDED_SCHOOL_MESSAGE } from './auth.service';
import { LoginThrottleService } from './login-throttle.service';
import { RefreshTokensService } from './refresh-tokens.service';

type UserWithSchool = User & { school: { status: SchoolStatus } | null };

function baseUser(overrides: Partial<UserWithSchool> = {}): UserWithSchool {
  return {
    id: 'user-1',
    email: 'teacher@smartteacher.dev',
    passwordHash: null,
    name: 'Tom Teacher',
    role: 'TEACHER',
    status: UserStatus.ACTIVE,
    inviteTokenHash: null,
    inviteTokenExpiresAt: null,
    resetTokenHash: null,
    resetTokenExpiresAt: null,
    activatedAt: null,
    schoolId: 'school-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    school: { status: SchoolStatus.ACTIVE },
    ...overrides,
  } as UserWithSchool;
}

describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    school: { findUnique: jest.Mock };
    user: { findUnique: jest.Mock; findFirst: jest.Mock };
  };
  let jwtService: { signAsync: jest.Mock; decode: jest.Mock };
  let refreshTokens: {
    issue: jest.Mock;
    validatePresented: jest.Mock;
    rotate: jest.Mock;
    revokeFamily: jest.Mock;
    revokeAllForUser: jest.Mock;
  };
  let loginThrottle: { assertNotLockedOut: jest.Mock; recordFailure: jest.Mock; clearFailures: jest.Mock };

  beforeEach(async () => {
    prisma = {
      school: { findUnique: jest.fn() },
      user: { findUnique: jest.fn(), findFirst: jest.fn() },
    };
    jwtService = {
      signAsync: jest.fn().mockResolvedValue('signed-access-token'),
      decode: jest.fn(),
    };
    refreshTokens = {
      issue: jest.fn().mockResolvedValue('minted-refresh-token'),
      validatePresented: jest.fn(),
      rotate: jest.fn(),
      revokeFamily: jest.fn(),
      revokeAllForUser: jest.fn(),
    };
    loginThrottle = {
      assertNotLockedOut: jest.fn().mockResolvedValue(undefined),
      recordFailure: jest.fn().mockResolvedValue(undefined),
      clearFailures: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: { getOrThrow: (key: string) => `config:${key}` } },
        {
          provide: TenantContextService,
          useValue: { runWithSystemBypass: (fn: () => unknown) => fn() },
        },
        { provide: RefreshTokensService, useValue: refreshTokens },
        { provide: LoginThrottleService, useValue: loginThrottle },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  describe('validateUser', () => {
    it('returns null, indistinguishably, for an unknown email', async () => {
      prisma.school.findUnique.mockResolvedValue({ id: 'school-1', status: SchoolStatus.ACTIVE });
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await service.validateUser('ghost@smartteacher.dev', 'whatever', '127.0.0.1', 'demo-school');

      expect(result).toBeNull();
      expect(loginThrottle.recordFailure).toHaveBeenCalledWith('demo-school:ghost@smartteacher.dev', '127.0.0.1');
    });

    it('returns null, indistinguishably, for a wrong password', async () => {
      const passwordHash = await bcrypt.hash('correct-password', 10);
      prisma.school.findUnique.mockResolvedValue({ id: 'school-1', status: SchoolStatus.ACTIVE });
      prisma.user.findUnique.mockResolvedValue(baseUser({ passwordHash }));

      const result = await service.validateUser(
        'teacher@smartteacher.dev',
        'wrong-password',
        '127.0.0.1',
        'demo-school',
      );

      expect(result).toBeNull();
      expect(loginThrottle.recordFailure).toHaveBeenCalled();
    });

    it('checks the lockout before touching the database', async () => {
      loginThrottle.assertNotLockedOut.mockRejectedValue(new Error('locked out'));

      await expect(
        service.validateUser('teacher@smartteacher.dev', 'x', '127.0.0.1', 'demo-school'),
      ).rejects.toThrow('locked out');
      expect(prisma.school.findUnique).not.toHaveBeenCalled();
    });

    it('rejects a disabled account with a distinct message, only after the password matches', async () => {
      const passwordHash = await bcrypt.hash('correct-password', 10);
      prisma.school.findUnique.mockResolvedValue({ id: 'school-1', status: SchoolStatus.ACTIVE });
      prisma.user.findUnique.mockResolvedValue(baseUser({ passwordHash, status: UserStatus.DISABLED }));

      await expect(
        service.validateUser('teacher@smartteacher.dev', 'correct-password', '127.0.0.1', 'demo-school'),
      ).rejects.toMatchObject({ message: DISABLED_ACCOUNT_MESSAGE });
      await expect(
        service.validateUser('teacher@smartteacher.dev', 'correct-password', '127.0.0.1', 'demo-school'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects a suspended school with a distinct message, only after the password matches', async () => {
      const passwordHash = await bcrypt.hash('correct-password', 10);
      prisma.school.findUnique.mockResolvedValue({ id: 'school-1', status: SchoolStatus.SUSPENDED });
      prisma.user.findUnique.mockResolvedValue(
        baseUser({ passwordHash, school: { status: SchoolStatus.SUSPENDED } }),
      );

      await expect(
        service.validateUser('teacher@smartteacher.dev', 'correct-password', '127.0.0.1', 'demo-school'),
      ).rejects.toMatchObject({ message: SUSPENDED_SCHOOL_MESSAGE });
    });

    it('clears failed-attempt history and returns the user on success', async () => {
      const passwordHash = await bcrypt.hash('correct-password', 10);
      prisma.school.findUnique.mockResolvedValue({ id: 'school-1', status: SchoolStatus.ACTIVE });
      prisma.user.findUnique.mockResolvedValue(baseUser({ passwordHash }));

      const result = await service.validateUser(
        'teacher@smartteacher.dev',
        'correct-password',
        '127.0.0.1',
        'demo-school',
      );

      expect(result).not.toBeNull();
      expect(loginThrottle.clearFailures).toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('returns only the token pair — never the password hash or other user fields', async () => {
      const result = await service.login(baseUser({ passwordHash: 'irrelevant-hash' }));

      expect(result).toEqual({ accessToken: 'signed-access-token', refreshToken: 'minted-refresh-token' });
      expect(Object.keys(result).sort()).toEqual(['accessToken', 'refreshToken']);
    });
  });

  describe('refresh', () => {
    const payload = { sub: 'user-1', email: 'a@b.com', name: 'A', role: 'TEACHER', schoolId: 'school-1', jti: 'jti-1', familyId: 'fam-1' } as const;
    const record = { id: 'jti-1', familyId: 'fam-1', revokedAt: null } as unknown as RefreshToken;

    it('rotates and returns a fresh token pair', async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser());
      refreshTokens.validatePresented.mockResolvedValue(record);
      refreshTokens.rotate.mockResolvedValue({ kind: 'rotated', token: 'rotated-refresh-token' });

      const result = await service.refresh(payload, 'presented-token');

      expect(result).toEqual({ accessToken: 'signed-access-token', refreshToken: 'rotated-refresh-token' });
      expect(refreshTokens.rotate).toHaveBeenCalledWith(record, expect.objectContaining({ id: 'user-1' }));
    });

    it('rejects reuse detected outside the grace window (family already revoked)', async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser());
      refreshTokens.validatePresented.mockResolvedValue(record);
      refreshTokens.rotate.mockResolvedValue({ kind: 'reused-outside-grace' });

      await expect(service.refresh(payload, 'presented-token')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('blocks refresh with a distinct message once the account is disabled', async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser({ status: UserStatus.DISABLED }));

      await expect(service.refresh(payload, 'presented-token')).rejects.toMatchObject({
        message: DISABLED_ACCOUNT_MESSAGE,
      });
      expect(refreshTokens.validatePresented).not.toHaveBeenCalled();
    });

    it('blocks refresh with a distinct message once the school is suspended', async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser({ school: { status: SchoolStatus.SUSPENDED } }));

      await expect(service.refresh(payload, 'presented-token')).rejects.toMatchObject({
        message: SUSPENDED_SCHOOL_MESSAGE,
      });
    });
  });

  describe('logout', () => {
    it('revokes only the presented token\'s family when a refresh token is given', async () => {
      jwtService.decode.mockReturnValue({ familyId: 'fam-1' });

      await service.logout('user-1', 'some-refresh-token');

      expect(refreshTokens.revokeFamily).toHaveBeenCalledWith('fam-1', 'LOGGED_OUT');
      expect(refreshTokens.revokeAllForUser).not.toHaveBeenCalled();
    });

    it('revokes every session for the user when no refresh token is given', async () => {
      await service.logout('user-1');

      expect(refreshTokens.revokeAllForUser).toHaveBeenCalledWith('user-1');
      expect(refreshTokens.revokeFamily).not.toHaveBeenCalled();
    });
  });
});
