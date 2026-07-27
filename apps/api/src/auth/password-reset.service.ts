import { BadRequestException, ForbiddenException, GoneException, Injectable, Logger } from '@nestjs/common';
import { RefreshTokenRevokeReason, SchoolStatus, UserStatus } from '@prisma/client';
import { randomBytes, createHash } from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { MailService } from '../mail/mail.service';
import { LoginThrottleService } from './login-throttle.service';
import { SUSPENDED_SCHOOL_MESSAGE, DISABLED_ACCOUNT_MESSAGE } from './auth.service';

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const BCRYPT_ROUNDS = 10;

const GENERIC_RESET_MESSAGE = "If that email exists, we've sent a link.";

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly mailService: MailService,
    private readonly loginThrottle: LoginThrottleService,
  ) {}

  // Unauthenticated route (no tenant identity yet) — mirrors AuthService.validateUser's
  // explicit opt-out of tenant scoping via runWithSystemBypass. Every outcome except the
  // throttle check below is silent: no throw, no response difference, whether or not the
  // account exists, is pending, is disabled, or belongs to a suspended school.
  async requestReset(email: string, ip: string, schoolSlug?: string): Promise<void> {
    // Reset requests share the LoginAttempt table under a "reset:" key namespace, kept
    // separate from login lockout keys (see LoginThrottleService). This is the one path
    // in this method allowed to throw (429) — everything after it is deliberately silent.
    const emailKey = `reset:${schoolSlug ?? ''}:${email}`;
    const ipKey = `reset:${ip}`;
    await this.loginThrottle.assertResetNotThrottled(emailKey, ipKey);
    await this.loginThrottle.recordAttempt(emailKey, ipKey);

    return this.tenantContext.runWithSystemBypass(async () => {
      let schoolId: string | null = null;
      if (schoolSlug) {
        const school = await this.prisma.school.findUnique({ where: { slug: schoolSlug } });
        if (!school) {
          this.logger.debug(`Password reset requested for unknown school slug "${schoolSlug}"`);
          return;
        }
        schoolId = school.id;
      }

      const user = schoolId
        ? await this.prisma.user.findUnique({
            where: { schoolId_email: { schoolId, email } },
            include: { school: true },
          })
        : await this.prisma.user.findFirst({
            where: { email, schoolId: null },
            include: { school: true },
          });

      if (!user || user.status !== UserStatus.ACTIVE) {
        this.logger.debug(`Password reset requested for ineligible account: ${email}`);
        return;
      }

      if (user.school?.status === SchoolStatus.SUSPENDED) {
        this.logger.debug(`Password reset requested for a suspended school: ${email}`);
        return;
      }

      const token = randomBytes(32).toString('hex');
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          resetTokenHash: this.hash(token),
          resetTokenExpiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
        },
      });

      await this.mailService.sendPasswordReset({
        email: user.email,
        name: user.name,
        schoolName: user.school?.name ?? null,
        resetToken: token,
      });
    });
  }

  async resetPassword(token: string, password: string): Promise<void> {
    return this.tenantContext.runWithSystemBypass(async () => {
      const user = await this.prisma.user.findUnique({
        where: { resetTokenHash: this.hash(token) },
        include: { school: true },
      });

      // Covers never-existed, already-consumed, and superseded-by-a-newer-request —
      // all indistinguishable to the caller.
      if (!user) {
        throw new BadRequestException('This reset link is invalid or has already been used.');
      }

      if (!user.resetTokenExpiresAt || user.resetTokenExpiresAt.getTime() < Date.now()) {
        throw new GoneException('This reset link has expired. Please request a new one.');
      }

      if (user.school?.status === SchoolStatus.SUSPENDED) {
        throw new ForbiddenException(SUSPENDED_SCHOOL_MESSAGE);
      }

      // Only reachable if the account was disabled after the link was issued.
      if (user.status !== UserStatus.ACTIVE) {
        throw new ForbiddenException(DISABLED_ACCOUNT_MESSAGE);
      }

      if (password.toLowerCase() === user.email.toLowerCase()) {
        throw new BadRequestException('Password must be different from your email address.');
      }

      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      await this.prisma.$transaction([
        this.prisma.user.update({
          where: { id: user.id },
          data: { passwordHash, resetTokenHash: null, resetTokenExpiresAt: null },
        }),
        this.prisma.refreshToken.updateMany({
          where: { userId: user.id, revokedAt: null },
          data: { revokedAt: new Date(), revokeReason: RefreshTokenRevokeReason.PASSWORD_RESET },
        }),
      ]);

      // The caller has just proved control of the mailbox; a stale login lockout would
      // make the reset flow useless in exactly the case it's meant to unblock.
      await this.loginThrottle.clearFailures(`${user.school?.slug ?? ''}:${user.email}`);
    });
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}

export { GENERIC_RESET_MESSAGE };
