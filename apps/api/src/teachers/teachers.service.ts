import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, RefreshTokenRevokeReason, Role, SubjectStatus, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { PasswordsService } from '../passwords/passwords.service';
import { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { CreateTeacherDto } from './dto/create-teacher.dto';
import { TeacherEntity } from './entities/teacher.entity';

type TeacherRow = Prisma.UserGetPayload<Record<string, never>>;

// P2002's `target` lists the columns of the violated constraint, same reasoning as
// StudentsService's conflictTarget.
function conflictTarget(error: unknown): string {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    const target = error.meta?.target;
    return Array.isArray(target) ? target.join(',') : '';
  }
  return '';
}

@Injectable()
export class TeachersService {
  private readonly logger = new Logger(TeachersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly passwordsService: PasswordsService,
  ) {}

  async create(dto: CreateTeacherDto, actor: AuthenticatedUser): Promise<TeacherEntity> {
    if (!actor.schoolId) {
      throw new ForbiddenException('A platform user cannot create tenant users directly');
    }
    const schoolId = actor.schoolId;

    const school = await this.prisma.school.findUnique({ where: { id: schoolId } });
    if (!school) {
      throw new NotFoundException('School not found');
    }

    const subjectIds = [...new Set(dto.subjectIds ?? [])];
    const subjects =
      subjectIds.length > 0
        ? await this.prisma.subject.findMany({ where: { id: { in: subjectIds } } })
        : [];
    if (subjects.length !== subjectIds.length) {
      throw new NotFoundException('Subject not found');
    }
    const retired = subjects.filter((subject) => subject.status === SubjectStatus.RETIRED);
    if (retired.length > 0) {
      throw new BadRequestException(
        `Subject(s) have been retired and cannot be assigned: ${retired.map((subject) => subject.code).join(', ')}`,
      );
    }

    const { password, passwordHash } = await this.passwordsService.resolve(dto.password, dto.email);
    const name = `${dto.firstName} ${dto.lastName}`;

    let teacher: TeacherRow;
    try {
      teacher = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email: dto.email,
            name,
            firstName: dto.firstName,
            lastName: dto.lastName,
            role: Role.TEACHER,
            status: UserStatus.ACTIVE,
            activatedAt: new Date(),
            schoolId,
            passwordHash,
            plainPassword: password,
          },
        });

        // School-wide "qualified to teach" grants, sectionId null — the same shape the
        // teacher CSV import produces, same table TeacherAssignmentsService writes to.
        if (subjectIds.length > 0) {
          await tx.teacherAssignment.createMany({
            data: subjectIds.map((subjectId) => ({ schoolId, userId: user.id, subjectId })),
          });
        }

        return user;
      });
    } catch (error) {
      const target = conflictTarget(error);
      if (target.includes('email')) {
        throw new ConflictException('A user with this email already exists in this school');
      }
      throw error;
    }

    if (dto.sendCredentialsEmail) {
      try {
        await this.mailService.sendCredentials({
          email: dto.email,
          name,
          role: Role.TEACHER,
          schoolName: school.name,
          schoolSlug: school.slug,
          password,
        });
      } catch (error) {
        this.logger.error(`Failed to send credentials to ${dto.email}`, error instanceof Error ? error.stack : undefined);
      }
    }

    return {
      id: teacher.id,
      password,
      email: teacher.email,
      firstName: teacher.firstName,
      lastName: teacher.lastName,
      name: teacher.name,
      status: teacher.status,
      activatedAt: teacher.activatedAt,
      createdAt: teacher.createdAt,
      subjects: subjects.map((subject) => ({ id: subject.id, name: subject.name, code: subject.code })),
    };
  }

  async getPassword(id: string): Promise<{ password: string | null }> {
    const teacher = await this.prisma.user.findUnique({ where: { id }, select: { role: true, plainPassword: true } });
    if (!teacher || teacher.role !== Role.TEACHER) {
      throw new NotFoundException('Teacher not found');
    }
    return { password: teacher.plainPassword };
  }

  async setPassword(id: string, supplied: string | undefined): Promise<{ password: string }> {
    const teacher = await this.prisma.user.findUnique({ where: { id }, select: { role: true, email: true } });
    if (!teacher || teacher.role !== Role.TEACHER) {
      throw new NotFoundException('Teacher not found');
    }
    const { password, passwordHash } = await this.passwordsService.resolve(supplied, teacher.email);
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
