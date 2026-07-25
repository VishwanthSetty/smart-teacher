import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role, SchoolStatus, UserStatus } from '@prisma/client';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { CreateSchoolDto } from './dto/create-school.dto';
import { UpdateSchoolDto } from './dto/update-school.dto';
import { ListSchoolsQueryDto } from './dto/list-schools-query.dto';
import { SchoolEntity } from './entities/school.entity';
import { PaginatedSchoolsEntity } from './entities/paginated-schools.entity';

// Invite tokens let F-04 complete the pending admin's onboarding; they expire after a week.
const INVITE_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const BCRYPT_ROUNDS = 10;

@Injectable()
export class SchoolsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  async create(dto: CreateSchoolDto): Promise<SchoolEntity> {
    const inviteToken = randomBytes(32).toString('hex');
    const inviteTokenHash = await bcrypt.hash(inviteToken, BCRYPT_ROUNDS);
    const inviteTokenExpiresAt = new Date(Date.now() + INVITE_TOKEN_TTL_MS);

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

    await this.mailService.sendSchoolAdminInvite({
      email: dto.adminEmail,
      name: dto.adminName,
      schoolName: school.name,
      schoolSlug: school.slug,
      inviteToken,
    });

    return SchoolEntity.fromModel(school);
  }

  async findAll(query: ListSchoolsQueryDto): Promise<PaginatedSchoolsEntity> {
    const where: Prisma.SchoolWhereInput = query.status ? { status: query.status } : {};
    const skip = (query.page - 1) * query.limit;

    const [schools, total] = await this.prisma.$transaction([
      this.prisma.school.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.school.count({ where }),
    ]);

    return {
      data: schools.map((school) => SchoolEntity.fromModel(school)),
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
        await tx.user.updateMany({
          where: { schoolId: id },
          data: { refreshTokenHash: null },
        });
      }

      return next;
    });

    return SchoolEntity.fromModel(updated);
  }
}
