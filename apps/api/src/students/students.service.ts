import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EnrollmentStatus, Prisma, Role, RefreshTokenRevokeReason, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { PasswordsService } from '../passwords/passwords.service';
import { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { ListStudentsQueryDto } from './dto/list-students-query.dto';
import { StudentEnrollmentEntity, StudentEntity } from './entities/student.entity';
import { PaginatedStudentsEntity } from './entities/paginated-students.entity';
import { AddStudentEnrollmentDto } from './dto/add-student-enrollment.dto';
import { UpdateStudentEnrollmentDto } from './dto/update-student-enrollment.dto';
import {
  ENROLLMENT_WITH_SECTION_INCLUDE,
  EnrollmentsService,
  EnrollmentWithSection,
} from './enrollments.service';

// Current class first, so `enrollments[0]` is always the one the student is in.
const STUDENT_ENROLLMENT_INCLUDE = {
  where: { status: EnrollmentStatus.ACTIVE },
  orderBy: [{ isCurrent: 'desc' }, { startedAt: 'asc' }],
  include: ENROLLMENT_WITH_SECTION_INCLUDE,
} satisfies Prisma.User$enrollmentsArgs;

type StudentRow = Prisma.UserGetPayload<{ include: { enrollments: typeof STUDENT_ENROLLMENT_INCLUDE } }>;

// P2002's `target` lists the columns of the violated constraint, which is what lets a
// caller be told which of several separately-unique fields collided.
function conflictTarget(error: unknown): string {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    const target = error.meta?.target;
    if (Array.isArray(target)) {
      return target.join(',');
    }
    return typeof target === 'string' ? target : '';
  }
  return '';
}

// Each enrollment write can trip either per-section partial index; the roll-number one is
// checked first because its target also names sectionId.
function toEnrollmentConflict(error: unknown): ConflictException | null {
  const target = conflictTarget(error);
  if (target.includes('rollNumber')) {
    return new ConflictException('That roll number is already used in this section');
  }
  if (target.includes('userId') && target.includes('sectionId')) {
    return new ConflictException('The student is already enrolled in this section');
  }
  return null;
}

function toEnrollmentEntity(enrollment: EnrollmentWithSection): StudentEnrollmentEntity {
  return {
    id: enrollment.id,
    sectionId: enrollment.sectionId,
    sectionName: enrollment.section.name,
    gradeLevelId: enrollment.section.gradeLevelId,
    gradeLevelName: enrollment.section.gradeLevel.name,
    rollNumber: enrollment.rollNumber,
    isCurrent: enrollment.isCurrent,
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
    enrollment: user.enrollments[0] ? toEnrollmentEntity(user.enrollments[0]) : null,
    enrollments: user.enrollments.map(toEnrollmentEntity),
  };
}

@Injectable()
export class StudentsService {
  private readonly logger = new Logger(StudentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly passwordsService: PasswordsService,
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
    if (dto.rollNumber && !dto.sectionId) {
      throw new BadRequestException('Choose a section before assigning a roll number');
    }

    if (dto.sectionId) {
      const section = await this.prisma.section.findUnique({ where: { id: dto.sectionId } });
      if (!section) {
        throw new NotFoundException('Section not found');
      }
    }

    const { password, passwordHash } = await this.passwordsService.resolve(dto.password, dto.email);
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
            status: UserStatus.ACTIVE,
            activatedAt: new Date(),
            schoolId,
            passwordHash,
            plainPassword: password,
          },
        });

        if (!dto.sectionId) {
          return { ...user, enrollments: [] };
        }

        const enrollment = await this.enrollments.enroll(tx, {
          schoolId,
          userId: user.id,
          sectionId: dto.sectionId,
          rollNumber: dto.rollNumber,
        });

        return { ...user, enrollments: [enrollment] };
      });
    } catch (error) {
      const enrollmentConflict = toEnrollmentConflict(error);
      if (enrollmentConflict) {
        throw enrollmentConflict;
      }
      if (conflictTarget(error).includes('email')) {
        throw new ConflictException('A user with this email already exists in this school');
      }
      throw error;
    }

    if (dto.sendCredentialsEmail) {
      try {
        await this.mailService.sendCredentials({
          email: dto.email,
          name,
          role: Role.STUDENT,
          schoolName: school.name,
          schoolSlug: school.slug,
          password,
        });
      } catch (error) {
        this.logger.error(`Failed to send credentials to ${dto.email}`, error instanceof Error ? error.stack : undefined);
      }
    }

    return { ...toEntity(student), password };
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

    // Ordered current-first by STUDENT_ENROLLMENT_INCLUDE. PATCH acts on this one class
    // only; the student's other classes are managed through the enrollment routes.
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
          const input = {
            schoolId,
            userId: id,
            sectionId: dto.sectionId,
            rollNumber: dto.rollNumber ?? currentEnrollment?.rollNumber,
          };
          enrollment = currentEnrollment
            ? await this.enrollments.replace(tx, currentEnrollment, input)
            : await this.enrollments.enroll(tx, input);
        } else if (dto.rollNumber !== undefined && currentEnrollment) {
          enrollment = await tx.enrollment.update({
            where: { id: currentEnrollment.id },
            data: { rollNumber: dto.rollNumber === '' ? null : dto.rollNumber },
            include: ENROLLMENT_WITH_SECTION_INCLUDE,
          });
        }

        const others = existing.enrollments.slice(1);
        return { ...user, enrollments: enrollment ? [enrollment, ...others] : others };
      });
    } catch (error) {
      throw toEnrollmentConflict(error) ?? error;
    }

    return toEntity(updated);
  }

  async addEnrollment(id: string, dto: AddStudentEnrollmentDto): Promise<StudentEntity> {
    const student = await this.findStudentOrThrow(id);
    // Tenant-scoped read: a cross-tenant section id 404s like a missing one.
    const section = await this.prisma.section.findUnique({ where: { id: dto.sectionId } });
    if (!section) {
      throw new NotFoundException('Section not found');
    }
    try {
      await this.prisma.$transaction(async (tx) => {
        await this.enrollments.enroll(tx, {
          schoolId: student.schoolId,
          userId: id,
          sectionId: dto.sectionId,
          rollNumber: dto.rollNumber || null,
        });
      });
    } catch (error) {
      throw toEnrollmentConflict(error) ?? error;
    }
    return this.findStudentEntity(id);
  }

  async updateEnrollment(
    id: string,
    enrollmentId: string,
    dto: UpdateStudentEnrollmentDto,
  ): Promise<StudentEntity> {
    await this.findStudentOrThrow(id);
    // Scoped by userId so a mismatched (student, enrollment) pair is the same 404 as a
    // missing one.
    const enrollment = await this.prisma.enrollment.findFirst({
      where: { id: enrollmentId, userId: id, status: EnrollmentStatus.ACTIVE },
      select: { id: true },
    });
    if (!enrollment) {
      throw new NotFoundException('Enrollment not found');
    }
    try {
      await this.prisma.enrollment.update({
        where: { id: enrollment.id },
        data: { rollNumber: dto.rollNumber === '' ? null : dto.rollNumber },
      });
    } catch (error) {
      throw toEnrollmentConflict(error) ?? error;
    }
    return this.findStudentEntity(id);
  }

  async removeEnrollment(id: string, enrollmentId: string): Promise<void> {
    await this.findStudentOrThrow(id);
    await this.prisma.$transaction(async (tx) => {
      await this.enrollments.end(tx, id, enrollmentId);
    });
  }

  // role !== STUDENT folds into the same 404 as "missing": these routes must never
  // confirm the existence of a teacher or admin account.
  private async findStudentOrThrow(id: string): Promise<{ id: string; schoolId: string }> {
    const student = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true, schoolId: true },
    });
    if (!student || student.role !== Role.STUDENT || !student.schoolId) {
      throw new NotFoundException('Student not found');
    }
    return { id: student.id, schoolId: student.schoolId };
  }

  private async findStudentEntity(id: string): Promise<StudentEntity> {
    const student = await this.prisma.user.findUnique({
      where: { id },
      include: { enrollments: STUDENT_ENROLLMENT_INCLUDE },
    });
    if (!student) {
      throw new NotFoundException('Student not found');
    }
    return toEntity(student);
  }

  async getPassword(id: string): Promise<{ password: string | null }> {
    const student = await this.prisma.user.findUnique({ where: { id }, select: { role: true, plainPassword: true } });
    if (!student || student.role !== Role.STUDENT) {
      throw new NotFoundException('Student not found');
    }
    return { password: student.plainPassword };
  }

  async setPassword(id: string, supplied: string | undefined): Promise<{ password: string }> {
    const student = await this.prisma.user.findUnique({ where: { id }, select: { role: true, email: true } });
    if (!student || student.role !== Role.STUDENT) {
      throw new NotFoundException('Student not found');
    }
    const { password, passwordHash } = await this.passwordsService.resolve(supplied, student.email);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id }, data: { passwordHash, plainPassword: password } }),
      this.prisma.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date(), revokeReason: RefreshTokenRevokeReason.PASSWORD_RESET },
      }),
    ]);
    return { password };
  }
}
