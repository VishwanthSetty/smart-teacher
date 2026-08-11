import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SubjectStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGradeLevelDto } from './dto/create-grade-level.dto';
import { UpdateGradeLevelDto } from './dto/update-grade-level.dto';
import { CreateSubjectDto } from './dto/create-subject.dto';
import { UpdateSubjectDto } from './dto/update-subject.dto';
import { GradeLevelEntity } from './entities/grade-level.entity';
import { SubjectEntity } from './entities/subject.entity';

const GRADE_LEVEL_SELECT = { id: true, name: true, rank: true } as const;
const SUBJECT_SELECT = { id: true, name: true, code: true, status: true } as const;

// Resolves a unique-constraint violation to the field that caused it. P2002's `target`
// lists the columns of the violated constraint, which is what lets a caller be told
// which of several separately-unique fields collided instead of guessing.
function conflictField(error: unknown): string | null {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    return null;
  }
  const target = error.meta?.target;
  return Array.isArray(target) ? String(target[0]) : null;
}

// The platform-wide grade level and subject taxonomy (F-06: "Manage grade-level &
// subject taxonomy", SUPER_ADMIN only). Both models are in PLATFORM_GLOBAL_MODELS: they
// carry no schoolId, and a school reaches the content keyed by them only through
// SchoolContentEntitlement.
@Injectable()
export class TaxonomyService {
  constructor(private readonly prisma: PrismaService) {}

  findAllGradeLevels(): Promise<GradeLevelEntity[]> {
    return this.prisma.gradeLevel.findMany({ select: GRADE_LEVEL_SELECT, orderBy: { rank: 'asc' } });
  }

  async createGradeLevel(dto: CreateGradeLevelDto): Promise<GradeLevelEntity> {
    try {
      return await this.prisma.gradeLevel.create({
        data: { name: dto.name, rank: dto.rank },
        select: GRADE_LEVEL_SELECT,
      });
    } catch (error) {
      // name and rank are separately @unique.
      const field = conflictField(error);
      if (field === 'rank') {
        throw new ConflictException('A grade level with this rank already exists');
      }
      if (field !== null) {
        throw new ConflictException('A grade level with this name already exists');
      }
      throw error;
    }
  }

  async updateGradeLevel(id: string, dto: UpdateGradeLevelDto): Promise<GradeLevelEntity> {
    const gradeLevel = await this.prisma.gradeLevel.findUnique({ where: { id }, select: { id: true } });
    if (gradeLevel === null) {
      throw new NotFoundException('Grade level not found');
    }

    try {
      return await this.prisma.gradeLevel.update({
        where: { id },
        data: { name: dto.name, rank: dto.rank },
        select: GRADE_LEVEL_SELECT,
      });
    } catch (error) {
      // name and rank are separately @unique, same as createGradeLevel.
      const field = conflictField(error);
      if (field === 'rank') {
        throw new ConflictException('A grade level with this rank already exists');
      }
      if (field !== null) {
        throw new ConflictException('A grade level with this name already exists');
      }
      throw error;
    }
  }

  async deleteGradeLevel(id: string): Promise<void> {
    const gradeLevel = await this.prisma.gradeLevel.findUnique({ where: { id }, select: { id: true } });
    if (gradeLevel === null) {
      throw new NotFoundException('Grade level not found');
    }

    // The curriculum count subsumes what used to be separate video and entitlement
    // counts: both now reach a grade level only through Curriculum, so a grade level with
    // no curriculum has neither.
    //
    // Same root-at-the-referencing-model reasoning as updateSubject's retiring check
    // below: Section is tenant-scoped, so counting it from a GradeLevel relation would
    // route through the tenant guard's relation walker and either throw
    // MissingTenantContextError (SUPER_ADMIN has no schoolId) or answer "in this one
    // tenant" — the wrong question for a platform-wide check.
    const [curriculumCount, sectionCount, assignmentCount] = await this.prisma.$transaction([
      this.prisma.curriculum.count({ where: { gradeLevelId: id } }),
      this.prisma.section.count({ where: { gradeLevelId: id } }),
      this.prisma.teacherAssignment.count({ where: { gradeLevelId: id } }),
    ]);
    if (curriculumCount > 0 || sectionCount > 0 || assignmentCount > 0) {
      throw new ConflictException(
        'This grade level is still used by curricula, sections or teacher assignments',
      );
    }

    await this.prisma.gradeLevel.delete({ where: { id } });
  }

  // Every subject, retired included — the admin surface needs to see a retired row to
  // reactivate it. The shared read path is findActiveSubjects.
  findAllSubjects(): Promise<SubjectEntity[]> {
    return this.prisma.subject.findMany({ select: SUBJECT_SELECT, orderBy: { name: 'asc' } });
  }

  // The canonical list every authenticated role reads (GET /subjects) to pick a subject
  // for a timetable or a teacher assignment, so a retired subject must not appear.
  findActiveSubjects(): Promise<SubjectEntity[]> {
    return this.prisma.subject.findMany({
      where: { status: SubjectStatus.ACTIVE },
      select: SUBJECT_SELECT,
      orderBy: { name: 'asc' },
    });
  }

  async createSubject(dto: CreateSubjectDto): Promise<SubjectEntity> {
    try {
      return await this.prisma.subject.create({
        data: { name: dto.name, code: dto.code },
        select: SUBJECT_SELECT,
      });
    } catch (error) {
      if (conflictField(error) !== null) {
        throw new ConflictException('A subject with this code already exists');
      }
      throw error;
    }
  }

  async updateSubject(id: string, dto: UpdateSubjectDto): Promise<SubjectEntity> {
    const subject = await this.prisma.subject.findUnique({
      where: { id },
      select: { status: true },
    });
    if (subject === null) {
      throw new NotFoundException('Subject not found');
    }

    const isRetiring =
      dto.status === SubjectStatus.RETIRED && subject.status !== SubjectStatus.RETIRED;
    if (isRetiring) {
      // The FKs are onDelete: Restrict, which stops a delete but not a status change —
      // retiring a referenced subject would strand live curricula and school grants
      // behind a subject nothing can reach. Timetable slots join this list when F-08
      // lands. The curriculum count subsumes videos and entitlements: both reach a
      // subject only through Curriculum now.
      //
      // Both counts are rooted at the referencing model on purpose. Asking
      // `subject.count({ where: { teacherAssignments: { some: {} } } })` instead would
      // route through the tenant guard's relation walker, which either throws
      // MissingTenantContextError (SUPER_ADMIN has no schoolId) or answers "assignments
      // in this one tenant" — the wrong question for a platform-wide check.
      const [curriculumCount, assignmentCount] = await this.prisma.$transaction([
        this.prisma.curriculum.count({ where: { subjectId: id } }),
        this.prisma.teacherAssignment.count({ where: { subjectId: id } }),
      ]);
      if (curriculumCount > 0 || assignmentCount > 0) {
        throw new ConflictException(
          'This subject is still used by curricula or teacher assignments',
        );
      }
    }

    return this.prisma.subject.update({
      where: { id },
      data: { name: dto.name, status: dto.status },
      select: SUBJECT_SELECT,
    });
  }
}
