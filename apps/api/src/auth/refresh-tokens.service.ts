import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { RefreshToken, RefreshTokenRevokeReason, Role, User } from '@prisma/client';
import { createHash, randomUUID, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RefreshTokenPayload } from './types/refresh-token-payload.interface';

// A benign race (two tabs/devices refreshing the same session at once) presents the
// same now-rotated token twice in quick succession. Reuse inside this window issues a
// sibling instead of treating it as theft; reuse after it revokes the whole family.
const REFRESH_REUSE_GRACE_MS = 30_000;

export type RefreshOutcome =
  | { kind: 'rotated'; token: string }
  | { kind: 'reused-outside-grace' };

@Injectable()
export class RefreshTokensService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  // Starts a brand-new session/device lineage (login, not rotation).
  async issue(user: User): Promise<string> {
    const minted = await this.mint(user, randomUUID());
    await this.prisma.refreshToken.create({ data: this.toCreateData(minted) });
    return minted.token;
  }

  async validatePresented(payload: RefreshTokenPayload, presentedToken: string): Promise<RefreshToken> {
    const record = await this.prisma.refreshToken.findUnique({ where: { id: payload.jti } });
    if (!record || record.userId !== payload.sub || record.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Access denied');
    }

    if (!this.hashMatches(presentedToken, record.tokenHash)) {
      throw new UnauthorizedException('Access denied');
    }

    return record;
  }

  // Rotates a presented, already-validated token. Reuse is only forgivable when the
  // token's own revocation was a normal ROTATED one *and* it happened within the grace
  // window — a token killed by revokeFamily/revokeAllForUser (theft response, logout)
  // must never be revived, no matter how recently that happened, or a family-wide kill
  // would itself look like a "recent benign rotation" to this same check.
  async rotate(record: RefreshToken, user: User): Promise<RefreshOutcome> {
    if (record.revokedAt !== null) {
      const revokedMsAgo = Date.now() - record.revokedAt.getTime();
      const gracePeriodApplies = record.revokeReason === RefreshTokenRevokeReason.ROTATED;
      if (!gracePeriodApplies || revokedMsAgo > REFRESH_REUSE_GRACE_MS) {
        await this.revokeFamily(record.familyId, RefreshTokenRevokeReason.REUSE_DETECTED);
        return { kind: 'reused-outside-grace' };
      }
    }

    const minted = await this.mint(user, record.familyId);
    await this.prisma.$transaction([
      this.prisma.refreshToken.update({
        where: { id: record.id },
        data: {
          revokedAt: record.revokedAt ?? new Date(),
          revokeReason: record.revokeReason ?? RefreshTokenRevokeReason.ROTATED,
          replacedByTokenId: minted.jti,
        },
      }),
      this.prisma.refreshToken.create({ data: this.toCreateData(minted) }),
    ]);

    return { kind: 'rotated', token: minted.token };
  }

  async revokeFamily(familyId: string, reason: RefreshTokenRevokeReason): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date(), revokeReason: reason },
    });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokeReason: RefreshTokenRevokeReason.LOGGED_OUT },
    });
  }

  private async mint(
    user: User,
    familyId: string,
  ): Promise<{ jti: string; familyId: string; userId: string; token: string; tokenHash: string; expiresAt: Date }> {
    const jti = randomUUID();
    const payload: RefreshTokenPayload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role as Role,
      schoolId: user.schoolId,
      jti,
      familyId,
    };

    const token = await this.jwtService.signAsync(payload, {
      secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.configService.getOrThrow<string>('JWT_REFRESH_EXPIRY'),
    });

    const decoded = this.jwtService.decode(token) as { exp: number };

    return {
      jti,
      familyId,
      userId: user.id,
      token,
      tokenHash: this.hash(token),
      expiresAt: new Date(decoded.exp * 1000),
    };
  }

  private toCreateData(minted: { jti: string; familyId: string; userId: string; tokenHash: string; expiresAt: Date }) {
    return {
      id: minted.jti,
      tokenHash: minted.tokenHash,
      familyId: minted.familyId,
      userId: minted.userId,
      expiresAt: minted.expiresAt,
    };
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private hashMatches(token: string, storedHash: string): boolean {
    const presented = Buffer.from(this.hash(token), 'hex');
    const stored = Buffer.from(storedHash, 'hex');
    return presented.length === stored.length && timingSafeEqual(presented, stored);
  }
}
