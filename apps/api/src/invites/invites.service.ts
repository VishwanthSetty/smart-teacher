import { BadRequestException, ConflictException, ForbiddenException, GoneException, Injectable, NotFoundException } from '@nestjs/common';
import { UserStatus, SchoolStatus } from '@prisma/client';
import { randomBytes, createHash } from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { MailService } from '../mail/mail.service';
import { SUSPENDED_SCHOOL_MESSAGE } from '../auth/auth.service';

const INVITE_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const BCRYPT_ROUNDS = 10;

export interface InviteTokenMaterial {
  token: string;
  tokenHash: string;
  expiresAt: Date;
}

@Injectable()
export class InvitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly mailService: MailService,
  ) {}

  // High-entropy (256-bit) token: the sha256 hash doubles as a direct, unique lookup
  // key, so redemption never needs to scan-and-compare like a bcrypt hash would.
  mintToken(): InviteTokenMaterial {
    const token = randomBytes(32).toString('hex');
    return {
      token,
      tokenHash: this.hash(token),
      expiresAt: new Date(Date.now() + INVITE_TOKEN_TTL_MS),
    };
  }

  // Unauthenticated route (no tenant identity yet) — mirrors AuthService.validateUser's
  // explicit opt-out of tenant scoping via runWithSystemBypass.
  async redeem(token: string, password: string): Promise<void> {
    return this.tenantContext.runWithSystemBypass(async () => {
      const user = await this.prisma.user.findUnique({
        where: { inviteTokenHash: this.hash(token) },
        include: { school: true },
      });

      // Covers both "never existed" and "already redeemed" (redeem nulls the hash),
      // and a token invalidated by resend (the hash was overwritten) — all the same
      // generic message, since the token proves nothing about account existence.
      if (!user || user.status !== UserStatus.PENDING) {
        throw new BadRequestException('This invite link is invalid or has already been used.');
      }

      if (user.school?.status === SchoolStatus.SUSPENDED) {
        throw new ForbiddenException(SUSPENDED_SCHOOL_MESSAGE);
      }

      if (!user.inviteTokenExpiresAt || user.inviteTokenExpiresAt.getTime() < Date.now()) {
        throw new GoneException('This invite has expired. Ask your administrator to send a new invite.');
      }

      if (password.toLowerCase() === user.email.toLowerCase()) {
        throw new BadRequestException('Password must be different from your email address.');
      }

      // Single write — no $transaction needed. A PENDING user has never logged in, so
      // there are no refresh tokens to revoke.
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
          status: UserStatus.ACTIVE,
          activatedAt: new Date(),
          inviteTokenHash: null,
          inviteTokenExpiresAt: null,
        },
      });
    });
  }

  // Runs in the caller's ambient tenant context (not bypassed), so SCHOOL_ADMIN
  // callers are auto-scoped to their own school by the tenant guard; only a
  // @BypassTenantScope route lets SUPER_ADMIN cross tenants.
  async resendForUser(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, include: { school: true } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.status !== UserStatus.PENDING) {
      throw new ConflictException('User has already activated their account');
    }
    if (!user.school) {
      throw new ConflictException('User has no associated school');
    }

    const { token, tokenHash, expiresAt } = this.mintToken();
    // Replacing the hash invalidates the old link immediately, even if it's still live.
    await this.prisma.user.update({
      where: { id: user.id },
      data: { inviteTokenHash: tokenHash, inviteTokenExpiresAt: expiresAt },
    });

    await this.mailService.sendUserInvite({
      email: user.email,
      name: user.name,
      role: user.role,
      schoolName: user.school.name,
      schoolSlug: user.school.slug,
      inviteToken: token,
    });
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
