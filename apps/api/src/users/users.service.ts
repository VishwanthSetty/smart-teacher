import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { InvitesService } from '../invites/invites.service';
import { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { actorScopeOf, requireReadable } from '../common/authorization/resource-access';
import { CreateUserDto } from './dto/create-user.dto';
import { UserEntity } from './entities/user.entity';
import { MeEntity } from './entities/me.entity';
import { UsersAccessPolicy } from './users-access.policy';

const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  status: true,
  activatedAt: true,
  createdAt: true,
} as const;

const ME_SCHOOL_SELECT = {
  id: true,
  name: true,
  slug: true,
  status: true,
} as const;

export interface UserCounts {
  students: number;
  teachers: number;
  pendingInvites: number;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly invitesService: InvitesService,
    private readonly usersAccessPolicy: UsersAccessPolicy,
  ) {}

  findAll(): Promise<UserEntity[]> {
    return this.prisma.user.findMany({ select: USER_SELECT });
  }

  // The access token already carries everything except the school's name, so this joins
  // only what the claims can't supply. SUPER_ADMIN belongs to no tenant and skips the
  // query entirely. No @BypassTenantScope() is needed on the route: School is absent
  // from TENANT_SCOPED_MODELS, so the guard passes this through and the `id` filter
  // below is what scopes it.
  async getProfile(actor: AuthenticatedUser): Promise<MeEntity> {
    const claims = {
      id: actor.sub,
      email: actor.email,
      name: actor.name,
      role: actor.role,
      schoolId: actor.schoolId,
    };

    if (!actor.schoolId) {
      return { ...claims, school: null };
    }

    const school = await this.prisma.school.findUnique({
      where: { id: actor.schoolId },
      select: ME_SCHOOL_SELECT,
    });

    return { ...claims, school };
  }

  // Tenant scoping is automatic — the guard extension scopes `count` alongside the
  // read operations, so these are always the caller's own school. DISABLED accounts are
  // excluded from headcounts (a disabled account is not a member of the school), while
  // pendingInvites deliberately spans every role.
  async countMembership(): Promise<UserCounts> {
    const [students, teachers, pendingInvites] = await this.prisma.$transaction([
      this.prisma.user.count({
        where: { role: Role.STUDENT, status: { not: UserStatus.DISABLED } },
      }),
      this.prisma.user.count({
        where: { role: Role.TEACHER, status: { not: UserStatus.DISABLED } },
      }),
      this.prisma.user.count({ where: { status: UserStatus.PENDING } }),
    ]);

    return { students, teachers, pendingInvites };
  }

  async findOne(id: string): Promise<UserEntity> {
    const user = await this.prisma.user.findUnique({ where: { id }, select: USER_SELECT });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  // Self-vs-admin read, gated by the shared ownership primitive rather than a bespoke
  // check — proves requireReadable's 404-not-403 semantics against the real tenant
  // guard (the tenant guard already scoped the findUnique; this adds the per-actor rule).
  async findOneVisibleTo(id: string, actor: AuthenticatedUser): Promise<UserEntity> {
    const user = await this.prisma.user.findUnique({ where: { id }, select: USER_SELECT });
    return requireReadable<UserEntity>(user, actorScopeOf(actor), this.usersAccessPolicy, 'User not found');
  }

  async create(dto: CreateUserDto, actor: AuthenticatedUser): Promise<UserEntity> {
    if (!actor.schoolId) {
      throw new ForbiddenException('A platform user cannot create tenant users directly');
    }

    const school = await this.prisma.school.findUnique({ where: { id: actor.schoolId } });
    if (!school) {
      throw new NotFoundException('School not found');
    }

    const { token: inviteToken, tokenHash: inviteTokenHash, expiresAt: inviteTokenExpiresAt } =
      this.invitesService.mintToken();

    let user;
    try {
      user = await this.prisma.user.create({
        data: {
          email: dto.email,
          name: dto.name,
          role: dto.role,
          status: UserStatus.PENDING,
          schoolId: actor.schoolId,
          inviteTokenHash,
          inviteTokenExpiresAt,
        },
        select: USER_SELECT,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('A user with this email already exists in this school');
      }
      throw error;
    }

    await this.mailService.sendUserInvite({
      email: dto.email,
      name: dto.name,
      role: dto.role,
      schoolName: school.name,
      schoolSlug: school.slug,
      inviteToken,
    });

    return user;
  }
}
