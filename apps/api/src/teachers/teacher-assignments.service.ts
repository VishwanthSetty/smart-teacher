import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role, SubjectStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { CreateTeacherAssignmentDto } from './dto/create-teacher-assignment.dto';
import { ListTeacherAssignmentsQueryDto } from './dto/list-teacher-assignments-query.dto';
import { TeacherAssignmentEntity } from './entities/teacher-assignment.entity';

const ASSIGNMENT_INCLUDE = {
  user: { select: { id: true, name: true, email: true } },
  subject: { select: { id: true, name: true, code: true } },
  section: { select: { id: true, name: true, gradeLevel: { select: { id: true, name: true } } } },
  gradeLevel: { select: { id: true, name: true } },
} as const;

export interface TaughtPair {
  gradeLevelId: string;
  subjectId: string;
}

type AssignmentWithRelations = Prisma.TeacherAssignmentGetPayload<{ include: typeof ASSIGNMENT_INCLUDE }>;

function toEntity(assignment: AssignmentWithRelations): TeacherAssignmentEntity {
  return {
    id: assignment.id,
    teacherId: assignment.user.id,
    teacherName: assignment.user.name,
    teacherEmail: assignment.user.email,
    subjectId: assignment.subject.id,
    subjectName: assignment.subject.name,
    subjectCode: assignment.subject.code,
    sectionId: assignment.section?.id ?? null,
    sectionName: assignment.section?.name ?? null,
    gradeLevelId: assignment.gradeLevel?.id ?? null,
    gradeLevelName: assignment.gradeLevel?.name ?? null,
    sectionLabel: assignment.section ? `${assignment.section.gradeLevel.name} - ${assignment.section.name}` : null,
    createdAt: assignment.createdAt,
  };
}

@Injectable()
export class TeacherAssignmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ListTeacherAssignmentsQueryDto): Promise<TeacherAssignmentEntity[]> {
    const where: Prisma.TeacherAssignmentWhereInput = {
      ...(query.teacherId ? { userId: query.teacherId } : {}),
      ...(query.sectionId ? { sectionId: query.sectionId } : {}),
      ...(query.subjectId ? { subjectId: query.subjectId } : {}),
      ...(query.gradeLevelId ? { gradeLevelId: query.gradeLevelId } : {}),
    };

    const assignments = await this.prisma.teacherAssignment.findMany({
      where,
      include: ASSIGNMENT_INCLUDE,
      orderBy: [
        { section: { gradeLevel: { rank: 'asc' } } },
        { section: { name: 'asc' } },
        { subject: { name: 'asc' } },
      ],
    });
    return assignments.map(toEntity);
  }

  async taughtPairsFor(userId: string): Promise<TaughtPair[]> {
    const rows = await this.prisma.teacherAssignment.findMany({
      where: { userId, gradeLevelId: { not: null } },
      select: { gradeLevelId: true, subjectId: true },
      distinct: ['gradeLevelId', 'subjectId'],
    });
    return rows.flatMap((row) =>
      row.gradeLevelId === null ? [] : [{ gradeLevelId: row.gradeLevelId, subjectId: row.subjectId }],
    );
  }

  async create(dto: CreateTeacherAssignmentDto, actor: AuthenticatedUser): Promise<TeacherAssignmentEntity> {
    if (!actor.schoolId) {
      throw new ForbiddenException('A platform user cannot assign teachers directly');
    }
    const schoolId = actor.schoolId;

    // A cross-tenant id must 404, not leak existence via a validation error — the tenant
    // guard already scopes this read to the caller's own school.
    const teacher = await this.prisma.user.findUnique({ where: { id: dto.teacherId } });
    if (!teacher || teacher.role !== Role.TEACHER) {
      throw new NotFoundException('Teacher not found');
    }

    const subject = await this.prisma.subject.findUnique({ where: { id: dto.subjectId } });
    if (!subject) {
      throw new NotFoundException('Subject not found');
    }
    if (subject.status === SubjectStatus.RETIRED) {
      throw new BadRequestException('That subject has been retired and cannot be assigned');
    }

    let gradeLevelId = dto.gradeLevelId ?? null;
    if (dto.sectionId) {
      const section = await this.prisma.section.findUnique({
        where: { id: dto.sectionId },
        select: { gradeLevelId: true },
      });
      if (!section) {
        throw new NotFoundException('Section not found');
      }
      if (dto.gradeLevelId && dto.gradeLevelId !== section.gradeLevelId) {
        throw new BadRequestException('That grade level does not match the section');
      }
      gradeLevelId = section.gradeLevelId;

      // Named ahead of the insert so the conflict message can identify the incumbent —
      // the partial unique index below is the actual guarantee, this is just a better
      // error message for the common (non-race) case.
      const existing = await this.prisma.teacherAssignment.findFirst({
        where: { sectionId: dto.sectionId, subjectId: dto.subjectId },
        include: { user: { select: { name: true } } },
      });
      if (existing) {
        throw new ConflictException(
          `${existing.user.name} is already assigned to this subject for this section`,
        );
      }
    } else if (gradeLevelId) {
      const gradeExists = await this.prisma.gradeLevel.count({ where: { id: gradeLevelId } });
      if (gradeExists === 0) {
        throw new NotFoundException('Grade level not found');
      }
    }

    try {
      // schoolId is passed explicitly even though the tenant guard would stamp it — the
      // guard's mismatch check verifies the value rather than trusting it, same as
      // SectionsService.create.
      const assignment = await this.prisma.teacherAssignment.create({
        data: {
          schoolId,
          userId: dto.teacherId,
          subjectId: dto.subjectId,
          sectionId: dto.sectionId ?? null,
          gradeLevelId,
        },
        include: ASSIGNMENT_INCLUDE,
      });
      return toEntity(assignment);
    } catch (error) {
      // Race-loser path for the pre-check above, and the duplicate path for section-less
      // rows. The two hand-written partial indexes don't map cleanly onto a single
      // column-name substring check the way Enrollment's do, so this doesn't try to
      // disambiguate — one generic message covers both.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('This teacher is already assigned to that subject');
      }
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    const assignment = await this.prisma.teacherAssignment.findUnique({ where: { id } });
    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }

    // F-09: when timetable slots exist, this is where a slot-usage count goes — the
    // caller gets a 409 unless it re-sends with an explicit override. Nothing to check
    // until then.
    await this.prisma.teacherAssignment.delete({ where: { id } });
  }
}
