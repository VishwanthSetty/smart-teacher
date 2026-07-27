import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { RefreshTokenRevokeReason, Role, SchoolStatus, User, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { LoginThrottleService } from './login-throttle.service';
import { RefreshTokensService } from './refresh-tokens.service';
import { AuthenticatedUser } from './types/authenticated-user.interface';
import { RefreshTokenPayload } from './types/refresh-token-payload.interface';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

const SUSPENDED_SCHOOL_MESSAGE = 'This school is suspended. Please contact your administrator.';
const DISABLED_ACCOUNT_MESSAGE = 'This account has been disabled. Please contact your administrator.';
const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly tenantContext: TenantContextService,
    private readonly refreshTokens: RefreshTokensService,
    private readonly loginThrottle: LoginThrottleService,
  ) {}

  // Identity resolution runs before any tenant context exists (there's no
  // authenticated user yet), so it must explicitly opt out of tenant scoping rather
  // than rely on one being ambient.
  async validateUser(email: string, password: string, ip: string, schoolSlug?: string): Promise<User | null> {
    // Email is unique per tenant, so the lockout counter is scoped the same way —
    // otherwise an attacker could lock the same address out of every school it belongs to.
    const emailKey = `${schoolSlug ?? ''}:${email}`;
    await this.loginThrottle.assertNotLockedOut(emailKey, ip);

    return this.tenantContext.runWithSystemBypass(async () => {
      // A school slug scopes the lookup to one tenant; without it, only platform
      // users (SUPER_ADMIN, schoolId null) are considered.
      let schoolId: string | null = null;
      if (schoolSlug) {
        const school = await this.prisma.school.findUnique({ where: { slug: schoolSlug } });
        if (!school) {
          await this.loginThrottle.recordFailure(emailKey, ip);
          return null;
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

      // Pending invites have no usable password until redeemed (see F-04).
      if (!user || !user.passwordHash || user.status === UserStatus.PENDING) {
        await this.loginThrottle.recordFailure(emailKey, ip);
        return null;
      }

      const passwordMatches = await bcrypt.compare(password, user.passwordHash);
      if (!passwordMatches) {
        await this.loginThrottle.recordFailure(emailKey, ip);
        return null;
      }

      // Checked only after the password is verified, so an unauthenticated caller
      // can't use these responses to learn whether a school/account exists at all.
      if (user.school?.status === SchoolStatus.SUSPENDED) {
        throw new ForbiddenException(SUSPENDED_SCHOOL_MESSAGE);
      }
      if (user.status === UserStatus.DISABLED) {
        throw new ForbiddenException(DISABLED_ACCOUNT_MESSAGE);
      }

      await this.loginThrottle.clearFailures(emailKey);
      return user;
    });
  }

  async login(user: User): Promise<TokenPair> {
    const [accessToken, refreshToken] = await Promise.all([
      this.signAccessToken(user),
      this.tenantContext.runWithSystemBypass(() => this.refreshTokens.issue(user)),
    ]);

    return { accessToken, refreshToken };
  }

  async refresh(payload: RefreshTokenPayload, presentedRefreshToken: string): Promise<TokenPair> {
    return this.tenantContext.runWithSystemBypass(async () => {
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        include: { school: true },
      });
      if (!user) {
        throw new UnauthorizedException('Access denied');
      }

      // Re-checked on every refresh (not just login) so a school suspension or
      // account disablement takes effect at the next refresh — at most one access
      // token's lifetime (~15m) of lag, not the full refresh token's lifetime.
      if (user.school?.status === SchoolStatus.SUSPENDED) {
        throw new ForbiddenException(SUSPENDED_SCHOOL_MESSAGE);
      }
      if (user.status === UserStatus.DISABLED) {
        throw new ForbiddenException(DISABLED_ACCOUNT_MESSAGE);
      }

      const record = await this.refreshTokens.validatePresented(payload, presentedRefreshToken);
      const outcome = await this.refreshTokens.rotate(record, user);
      if (outcome.kind === 'reused-outside-grace') {
        throw new UnauthorizedException('Access denied');
      }

      const accessToken = await this.signAccessToken(user);
      return { accessToken, refreshToken: outcome.token };
    });
  }

  async logout(userId: string, presentedRefreshToken?: string): Promise<void> {
    await this.tenantContext.runWithSystemBypass(async () => {
      if (presentedRefreshToken) {
        try {
          const payload = this.jwtService.decode(presentedRefreshToken) as RefreshTokenPayload | null;
          if (payload?.familyId) {
            await this.refreshTokens.revokeFamily(payload.familyId, RefreshTokenRevokeReason.LOGGED_OUT);
            return;
          }
        } catch {
          // Fall through to revoking every session below.
        }
      }

      await this.refreshTokens.revokeAllForUser(userId);
    });
  }

  private async signAccessToken(user: User): Promise<string> {
    const payload: AuthenticatedUser = {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role as Role,
      schoolId: user.schoolId,
    };

    return this.jwtService.signAsync(payload, {
      secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.configService.getOrThrow<string>('JWT_ACCESS_EXPIRY'),
    });
  }
}

export { INVALID_CREDENTIALS_MESSAGE, SUSPENDED_SCHOOL_MESSAGE, DISABLED_ACCOUNT_MESSAGE };
