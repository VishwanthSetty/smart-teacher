import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role, SchoolStatus, User, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { AuthenticatedUser } from './types/authenticated-user.interface';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

const SUSPENDED_SCHOOL_MESSAGE = 'This school is suspended. Please contact your administrator.';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly tenantContext: TenantContextService,
  ) {}

  // Identity resolution runs before any tenant context exists (there's no
  // authenticated user yet), so it must explicitly opt out of tenant scoping rather
  // than rely on one being ambient.
  async validateUser(email: string, password: string, schoolSlug?: string): Promise<User | null> {
    return this.tenantContext.runWithSystemBypass(async () => {
      // A school slug scopes the lookup to one tenant; without it, only platform
      // users (SUPER_ADMIN, schoolId null) are considered.
      let schoolId: string | null = null;
      if (schoolSlug) {
        const school = await this.prisma.school.findUnique({ where: { slug: schoolSlug } });
        if (!school) {
          return null;
        }
        if (school.status === SchoolStatus.SUSPENDED) {
          throw new ForbiddenException(SUSPENDED_SCHOOL_MESSAGE);
        }
        schoolId = school.id;
      }

      const user = schoolId
        ? await this.prisma.user.findUnique({ where: { schoolId_email: { schoolId, email } } })
        : await this.prisma.user.findFirst({ where: { email, schoolId: null } });

      // Pending invites have no usable password until redeemed (see F-04).
      if (!user || !user.passwordHash || user.status === UserStatus.PENDING) {
        return null;
      }

      const passwordMatches = await bcrypt.compare(password, user.passwordHash);
      return passwordMatches ? user : null;
    });
  }

  async login(user: User): Promise<TokenPair> {
    const tokens = await this.issueTokens(user);
    const refreshTokenHash = await bcrypt.hash(tokens.refreshToken, 10);

    await this.tenantContext.runWithSystemBypass(() =>
      this.prisma.user.update({
        where: { id: user.id },
        data: { refreshTokenHash },
      }),
    );

    return tokens;
  }

  async refresh(userId: string, presentedRefreshToken: string): Promise<TokenPair> {
    const user = await this.tenantContext.runWithSystemBypass(() =>
      this.prisma.user.findUnique({
        where: { id: userId },
        include: { school: true },
      }),
    );

    if (!user || !user.refreshTokenHash) {
      throw new UnauthorizedException('Access denied');
    }

    const refreshTokenMatches = await bcrypt.compare(presentedRefreshToken, user.refreshTokenHash);
    if (!refreshTokenMatches) {
      throw new UnauthorizedException('Access denied');
    }

    // Suspending a tenant invalidates its users' sessions at the next refresh.
    if (user.school?.status === SchoolStatus.SUSPENDED) {
      throw new ForbiddenException(SUSPENDED_SCHOOL_MESSAGE);
    }

    return this.login(user);
  }

  async logout(userId: string): Promise<void> {
    await this.tenantContext.runWithSystemBypass(() =>
      this.prisma.user.update({
        where: { id: userId },
        data: { refreshTokenHash: null },
      }),
    );
  }

  private async issueTokens(user: User): Promise<TokenPair> {
    const payload: AuthenticatedUser = {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role as Role,
      schoolId: user.schoolId,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.configService.getOrThrow<string>('JWT_ACCESS_EXPIRY'),
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.configService.getOrThrow<string>('JWT_REFRESH_EXPIRY'),
      }),
    ]);

    return { accessToken, refreshToken };
  }
}
