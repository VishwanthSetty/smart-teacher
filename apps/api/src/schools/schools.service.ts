import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role, SchoolStatus, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { InvitesService } from '../invites/invites.service';
import { CreateSchoolDto } from './dto/create-school.dto';
import { UpdateSchoolDto } from './dto/update-school.dto';
import { ListSchoolsQueryDto } from './dto/list-schools-query.dto';
import { SchoolEntity } from './entities/school.entity';
import { PaginatedSchoolsEntity } from './entities/paginated-schools.entity';

@Injectable()
export class SchoolsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly invitesService: InvitesService,
  ) {}

  async create(dto: CreateSchoolDto): Promise<SchoolEntity> {
    const { token: inviteToken, tokenHash: inviteTokenHash, expiresAt: inviteTokenExpiresAt } =
      this.invitesService.mintToken();

    let school;
    try {
      // One transaction: the school and its first (pending) admin are created together.
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
            status: UserStatus.PENDING,
            schoolId: created.id,
            inviteTokenHash,
            inviteTokenExpiresAt,
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

    await this.mailService.sendUserInvite({
      email: dto.adminEmail,
      name: dto.adminName,
      role: Role.SCHOOL_ADMIN,
      schoolName: school.name,
      schoolSlug: school.slug,
      inviteToken,
    });

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
