import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { RefreshToken, Role, User, UserStatus } from '@prisma/client';
import { createHash } from 'crypto';
import { UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RefreshTokensService } from './refresh-tokens.service';

const user: User = {
  id: 'user-1',
  email: 'teacher@smartteacher.dev',
  passwordHash: 'hash',
  name: 'Tom Teacher',
  firstName: null,
  lastName: null,
  role: Role.TEACHER,
  status: UserStatus.ACTIVE,
  inviteTokenHash: null,
  inviteTokenExpiresAt: null,
  resetTokenHash: null,
  resetTokenExpiresAt: null,
  activatedAt: null,
  schoolId: 'school-1',
  createdAt: new Date(),
  updatedAt: new Date(),
};

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

describe('RefreshTokensService', () => {
  let service: RefreshTokensService;
  let prisma: {
    refreshToken: {
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let jwtService: { signAsync: jest.Mock; decode: jest.Mock };
  const futureExpirySeconds = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;

  beforeEach(async () => {
    prisma = {
      refreshToken: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    jwtService = {
      signAsync: jest.fn().mockResolvedValue('signed.refresh.token'),
      decode: jest.fn().mockReturnValue({ exp: futureExpirySeconds }),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        RefreshTokensService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: { getOrThrow: (key: string) => `config:${key}` } },
      ],
    }).compile();

    service = moduleRef.get(RefreshTokensService);
  });

  describe('issue', () => {
    it('persists a sha256 hash of the exact token, with expiresAt from the decoded exp claim', async () => {
      const token = await service.issue(user);

      expect(token).toBe('signed.refresh.token');
      expect(prisma.refreshToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tokenHash: sha256('signed.refresh.token'),
          userId: 'user-1',
          expiresAt: new Date(futureExpirySeconds * 1000),
        }),
      });
    });
  });

  describe('validatePresented', () => {
    const payload = {
      sub: 'user-1',
      jti: 'jti-1',
      familyId: 'fam-1',
      email: user.email,
      name: user.name,
      role: user.role,
      schoolId: user.schoolId,
    };

    it('rejects when no matching record exists', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);
      await expect(service.validatePresented(payload, 'any-token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects when the record belongs to a different user', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'jti-1',
        userId: 'someone-else',
        expiresAt: new Date(Date.now() + 10_000),
        tokenHash: sha256('the-token'),
      });
      await expect(service.validatePresented(payload, 'the-token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects an expired record', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'jti-1',
        userId: 'user-1',
        expiresAt: new Date(Date.now() - 1_000),
        tokenHash: sha256('the-token'),
      });
      await expect(service.validatePresented(payload, 'the-token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects a token whose hash does not match the stored record', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'jti-1',
        userId: 'user-1',
        expiresAt: new Date(Date.now() + 10_000),
        tokenHash: sha256('a-different-token'),
      });
      await expect(service.validatePresented(payload, 'the-token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('accepts a token that matches the stored hash', async () => {
      const record = {
        id: 'jti-1',
        userId: 'user-1',
        expiresAt: new Date(Date.now() + 10_000),
        tokenHash: sha256('the-token'),
      };
      prisma.refreshToken.findUnique.mockResolvedValue(record);
      await expect(service.validatePresented(payload, 'the-token')).resolves.toEqual(record);
    });
  });

  describe('rotate', () => {
    function record(overrides: Partial<RefreshToken> = {}): RefreshToken {
      return {
        id: 'jti-old',
        tokenHash: sha256('old-token'),
        familyId: 'fam-1',
        userId: 'user-1',
        expiresAt: new Date(Date.now() + 10_000),
        revokedAt: null,
        revokeReason: null,
        replacedByTokenId: null,
        createdAt: new Date(),
        ...overrides,
      };
    }

    it('rotates a not-yet-revoked token into a fresh one in the same family', async () => {
      const outcome = await service.rotate(record(), user);

      expect(outcome).toEqual({ kind: 'rotated', token: 'signed.refresh.token' });
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.refreshToken.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'jti-old' } }),
      );
      expect(prisma.refreshToken.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ familyId: 'fam-1' }) }),
      );
    });

    it('issues a sibling token (no family revoke) when a ROTATED token is reused within the grace window', async () => {
      const revokedAt = new Date(Date.now() - 5_000); // well inside the 30s grace window
      const outcome = await service.rotate(record({ revokedAt, revokeReason: 'ROTATED' }), user);

      expect(outcome).toEqual({ kind: 'rotated', token: 'signed.refresh.token' });
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });

    it('revokes the entire family when a ROTATED token is reused outside the grace window', async () => {
      const revokedAt = new Date(Date.now() - 60_000); // well outside the 30s grace window
      const outcome = await service.rotate(record({ revokedAt, revokeReason: 'ROTATED' }), user);

      expect(outcome).toEqual({ kind: 'reused-outside-grace' });
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { familyId: 'fam-1', revokedAt: null },
        data: { revokedAt: expect.any(Date), revokeReason: 'REUSE_DETECTED' },
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('never revives a token revoked for a reason other than ROTATED, even an instant later', async () => {
      // A family-wide kill (theft response, or logout) sets revokedAt to "just now" on
      // every sibling too — without the reason check, that would look identical to a
      // benign rotation race and get forgiven by the grace window.
      const revokedAt = new Date(Date.now() - 100);
      const outcome = await service.rotate(record({ revokedAt, revokeReason: 'LOGGED_OUT' }), user);

      expect(outcome).toEqual({ kind: 'reused-outside-grace' });
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { familyId: 'fam-1', revokedAt: null },
        data: { revokedAt: expect.any(Date), revokeReason: 'REUSE_DETECTED' },
      });
    });
  });
});
