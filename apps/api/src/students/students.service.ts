import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EnrollmentStatus, Prisma, Role, RefreshTokenRevokeReason, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { InvitesService } from '../invites/invites.service';
import { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { ListStudentsQueryDto } from './dto/list-students-query.dto';
import { StudentEntity } from './entities/student.entity';
import { PaginatedStudentsEntity } from './entities/paginated-students.entity';
import { EnrollmentsService, EnrollmentWithSection } from './enrollments.service';

const STUDENT_ENROLLMENT_INCLUDE = {
  where: { status: EnrollmentStatus.ACTIVE },
  take: 1,
  include: { section: { include: { gradeLevel: true } } },
} as const;

type StudentRow = Prisma.UserGetPayload<{ include: { enrollments: typeof STUDENT_ENROLLMENT_INCLUDE } }>;

// P2002's `target` lists the columns of the violated constraint, which is what lets a
// caller be told which of several separately-unique fields collided.
function conflictTarget(error: unknown): string {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    const target = error.meta?.target;
    return Array.isArray(target) ? target.join(',') : '';
  }
  return '';
}

function toEnrollmentEntity(enrollment: EnrollmentWithSection | undefined) {
  if (!enrollment) {
    return null;
  }
  return {
    id: enrollment.id,
    sectionId: enrollment.sectionId,
    sectionName: enrollment.section.name,
    gradeLevelId: enrollment.section.gradeLevelId,
    gradeLevelName: enrollment.section.gradeLevel.name,
    rollNumber: enrollment.rollNumber,
  };
}

function toEntity(user: StudentRow): StudentEntity {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    name: user.name,
    status: user.status,
    activatedAt: user.activatedAt,
    createdAt: user.createdAt,
    enrollment: toEnrollmentEntity(user.enrollments[0]),
  };
}

@Injectable()
export class StudentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly invitesService: InvitesService,
    private readonly enrollments: EnrollmentsService,
  ) {}

  async create(dto: CreateStudentDto, actor: AuthenticatedUser): Promise<StudentEntity> {
    if (!actor.schoolId) {
      throw new ForbiddenException('A platform user cannot create tenant users directly');
    }
    const schoolId = actor.schoolId;

    const school = await this.prisma.school.findUnique({ where: { id: schoolId } });
    if (!school) {
      throw new NotFoundException('School not found');
    }

    // A cross-tenant section id must 404, not leak existence via a validation error —
    // the tenant guard already scopes this read to the caller's own school.
    const section = await this.prisma.section.findUnique({ where: { id: dto.sectionId } });
    if (!section) {
      throw new NotFoundException('Section not found');
    }

    const { token: inviteToken, tokenHash: inviteTokenHash, expiresAt: inviteTokenExpiresAt } =
      this.invitesService.mintToken();
    const name = `${dto.firstName} ${dto.lastName}`;

    let student: StudentRow;
    try {
      student = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email: dto.email,
            name,
            firstName: dto.firstName,
            lastName: dto.lastName,
            role: Role.STUDENT,
            status: UserStatus.PENDING,
            schoolId,
            inviteTokenHash,
            inviteTokenExpiresAt,
          },
        });

        const enrollment = await this.enrollments.enroll(tx, {
          schoolId,
          userId: user.id,
          sectionId: dto.sectionId,
          rollNumber: dto.rollNumber,
        });

        return { ...user, enrollments: [enrollment] };
      });
    } catch (error) {
      const target = conflictTarget(error);
      if (target.includes('rollNumber')) {
        throw new ConflictException('That roll number is already used in this section');
      }
      if (target.includes('email')) {
        throw new ConflictException('A user with this email already exists in this school');
      }
      throw error;
    }

    // After the transaction commits: the student already exists as PENDING even if the
    // mail send fails, and resend-invite is the repair path (mirrors TeacherImportService).
    await this.mailService.sendUserInvite({
      email: dto.email,
      name,
      role: Role.STUDENT,
      schoolName: school.name,
      schoolSlug: school.slug,
      inviteToken,
    });

    return toEntity(student);
  }

  async findAll(query: ListStudentsQueryDto): Promise<PaginatedStudentsEntity> {
    const search = query.search?.trim();
    const where: Prisma.UserWhereInput = {
      role: Role.STUDENT,
      ...(query.status ? { status: query.status } : {}),
      ...(query.sectionId
        ? { enrollments: { some: { sectionId: query.sectionId, status: EnrollmentStatus.ACTIVE } } }
        : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
              {
                enrollments: {
                  some: { status: EnrollmentStatus.ACTIVE, rollNumber: { contains: search, mode: 'insensitive' } },
                },
              },
            ],
          }
        : {}),
    };
    const skip = (query.page - 1) * query.limit;

    const [students, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: { name: 'asc' },
        include: { enrollments: STUDENT_ENROLLMENT_INCLUDE },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: students.map(toEntity),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  // No actor parameter: the tenant guard already scopes the findUnique below to the
  // caller's own school, so a cross-tenant id 404s before any business rule runs.
  async update(id: string, dto: UpdateStudentDto): Promise<StudentEntity> {
    const existing = await this.prisma.user.findUnique({
      where: { id },
      include: { enrollments: STUDENT_ENROLLMENT_INCLUDE },
    });
    // role !== STUDENT is folded into the same 404 as "missing" — this route must never
    // confirm the existence of a teacher or admin account. A STUDENT always has a
    // schoolId (only StudentsService.create mints one, and it requires actor.schoolId),
    // so a null schoolId here means the row is corrupt, not that it belongs to no tenant.
    if (!existing || existing.role !== Role.STUDENT || !existing.schoolId) {
      throw new NotFoundException('Student not found');
    }
    const schoolId = existing.schoolId;

    const currentEnrollment = existing.enrollments[0];
    const changingSection = dto.sectionId !== undefined && dto.sectionId !== currentEnrollment?.sectionId;

    if (changingSection) {
      const section = await this.prisma.section.findUnique({ where: { id: dto.sectionId } });
      if (!section) {
        throw new NotFoundException('Section not found');
      }
    }

    const nameChanged = dto.firstName !== undefined || dto.lastName !== undefined;
    const firstName = dto.firstName ?? existing.firstName ?? '';
    const lastName = dto.lastName ?? existing.lastName ?? '';

    let updated: StudentRow;
    try {
      updated = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.update({
          where: { id },
          data: {
            ...(nameChanged ? { firstName, lastName, name: `${firstName} ${lastName}` } : {}),
            ...(dto.status ? { status: dto.status } : {}),
          },
        });

        // A disabled account must not keep a live session for up to 30 days — the same
        // reasoning as SchoolsService.update's suspension branch.
        if (dto.status === UserStatus.DISABLED) {
          await tx.refreshToken.updateMany({
            where: { userId: id, revokedAt: null },
            data: { revokedAt: new Date(), revokeReason: RefreshTokenRevokeReason.LOGGED_OUT },
          });
        }

        let enrollment: EnrollmentWithSection | undefined = currentEnrollment;
        if (changingSection && dto.sectionId) {
          await this.enrollments.endActive(tx, id);
          enrollment = await this.enrollments.enroll(tx, {
            schoolId,
            userId: id,
            sectionId: dto.sectionId,
            rollNumber: dto.rollNumber ?? currentEnrollment?.rollNumber,
          });
        } else if (dto.rollNumber !== undefined && currentEnrollment) {
          enrollment = await tx.enrollment.update({
            where: { id: currentEnrollment.id },
            data: { rollNumber: dto.rollNumber === '' ? null : dto.rollNumber },
            include: { section: { include: { gradeLevel: true } } },
          });
        }

        return { ...user, enrollments: enrollment ? [enrollment] : [] };
      });
    } catch (error) {
      const target = conflictTarget(error);
      if (target.includes('rollNumber')) {
        throw new ConflictException('That roll number is already used in this section');
      }
      throw error;
    }

    return toEntity(updated);
  }
}
