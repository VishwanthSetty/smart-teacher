import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Prisma, Role, SchoolStatus, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { InvitesService } from '../invites/invites.service';
import { CreateSchoolDto } from './dto/create-school.dto';
import { UpdateSchoolDto } from './dto/update-school.dto';
import { ListSchoolsQueryDto } from './dto/list-schools-query.dto';
import { SchoolEntity } from './entities/school.entity';
import { PaginatedSchoolsEntity } from './entities/paginated-schools.entity';

// Matches the hash cost used everywhere else a password is hashed (invites, password reset).
const BCRYPT_ROUNDS = 10;

@Injectable()
export class SchoolsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly invitesService: InvitesService,
  ) {}

  async getPlatformOverview(): Promise<{
    total: number;
    recent: Array<Pick<SchoolEntity, 'id' | 'name' | 'slug' | 'status'>>;
  }> {
    const [total, recent] = await Promise.all([
      this.prisma.school.count(),
      this.prisma.school.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, name: true, slug: true, status: true },
      }),
    ]);
    return { total, recent };
  }

  async create(dto: CreateSchoolDto): Promise<SchoolEntity> {
    const sendInvite = dto.sendInvite ?? true;

    if (!dto.adminPassword && !sendInvite) {
      throw new BadRequestException(
        'Provide an initial password or send an invite email so the school admin can sign in',
      );
    }
    if (dto.adminPassword && dto.adminPassword.toLowerCase() === dto.adminEmail.toLowerCase()) {
      throw new BadRequestException('Password must not match the admin email');
    }

    // Password mode activates the admin immediately and skips the invite token entirely;
    // invite mode keeps today's PENDING + set-password-link behaviour.
    const passwordHash = dto.adminPassword
      ? await bcrypt.hash(dto.adminPassword, BCRYPT_ROUNDS)
      : null;
    const invite = passwordHash
      ? null
      : this.invitesService.mintToken();

    let school;
    try {
      // One transaction: the school and its first admin are created together.
      school = await this.prisma.$transaction(async (tx) => {
        const created = await tx.school.create({
          data: {
            name: dto.name,
            slug: dto.slug,
            academicYear: dto.academicYear,
            plan: dto.plan,
          },
        });

        await tx.user.create({
          data: {
            email: dto.adminEmail,
            name: dto.adminName,
            role: Role.SCHOOL_ADMIN,
            schoolId: created.id,
            ...(passwordHash
              ? { status: UserStatus.ACTIVE, passwordHash, activatedAt: new Date() }
              : {
                  status: UserStatus.PENDING,
                  inviteTokenHash: invite?.tokenHash,
                  inviteTokenExpiresAt: invite?.expiresAt,
                }),
          },
        });

        return created;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('A school with this slug already exists');
      }
      throw error;
    }

    if (invite) {
      await this.mailService.sendUserInvite({
        email: dto.adminEmail,
        name: dto.adminName,
        role: Role.SCHOOL_ADMIN,
        schoolName: school.name,
        schoolSlug: school.slug,
        inviteToken: invite.token,
      });
    } else if (sendInvite) {
      // A password was already set — send a welcome notice, never a set-password link
      // (the account is ACTIVE, and InvitesService.redeem only accepts PENDING users).
      await this.mailService.sendSchoolAdminWelcome({
        email: dto.adminEmail,
        name: dto.adminName,
        schoolName: school.name,
        schoolSlug: school.slug,
      });
    }

    return SchoolEntity.fromModel(school, dto.adminEmail);
  }

  async findAll(query: ListSchoolsQueryDto): Promise<PaginatedSchoolsEntity> {
    const search = query.search?.trim();
    const where: Prisma.SchoolWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { slug: { contains: search, mode: 'insensitive' } },
              {
                users: {
                  some: { role: Role.SCHOOL_ADMIN, email: { contains: search, mode: 'insensitive' } },
                },
              },
            ],
          }
        : {}),
    };
    const skip = (query.page - 1) * query.limit;

    const [schools, total] = await this.prisma.$transaction([
      this.prisma.school.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        // Oldest SCHOOL_ADMIN is treated as the school's primary admin for display.
        include: {
          users: {
            where: { role: Role.SCHOOL_ADMIN },
            orderBy: { createdAt: 'asc' },
            take: 1,
            select: { email: true },
          },
        },
      }),
      this.prisma.school.count({ where }),
    ]);

    return {
      data: schools.map(({ users, ...school }) => SchoolEntity.fromModel(school, users[0]?.email ?? null)),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async findOne(id: string): Promise<SchoolEntity> {
    const school = await this.prisma.school.findUnique({
      where: { id },
      // Oldest SCHOOL_ADMIN is treated as the school's primary admin for display.
      include: {
        users: {
          where: { role: Role.SCHOOL_ADMIN },
          orderBy: { createdAt: 'asc' },
          take: 1,
          select: { email: true },
        },
      },
    });

    if (!school) {
      throw new NotFoundException('School not found');
    }

    const { users, ...rest } = school;
    return SchoolEntity.fromModel(rest, users[0]?.email ?? null);
  }

  async update(id: string, dto: UpdateSchoolDto): Promise<SchoolEntity> {
    const school = await this.prisma.school.findUnique({ where: { id } });
    if (!school) {
      throw new NotFoundException('School not found');
    }

    const suspending = dto.status === SchoolStatus.SUSPENDED && school.status !== SchoolStatus.SUSPENDED;

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.school.update({
        where: { id },
        data: {
          name: dto.name,
          status: dto.status,
        },
      });

      // Suspending forces every tenant user to re-authenticate: their next refresh fails.
      if (suspending) {
        await tx.refreshToken.updateMany({
          where: { user: { schoolId: id }, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }

      return next;
    });

    const admin = await this.prisma.user.findFirst({
      where: { schoolId: id, role: Role.SCHOOL_ADMIN },
      orderBy: { createdAt: 'asc' },
      select: { email: true },
    });

    return SchoolEntity.fromModel(updated, admin?.email ?? null);
  }
}
