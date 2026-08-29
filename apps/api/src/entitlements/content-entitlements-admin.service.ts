import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CurriculumStatus, Prisma, SubjectStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GrantEntitlementDto } from './dto/grant-entitlement.dto';
import { ReplaceEntitlementsDto } from './dto/replace-entitlements.dto';
import { EntitlementEntity } from './entities/entitlement.entity';
import { EntitlementOverviewEntity } from './entities/entitlement-overview.entity';

const ENTITLEMENT_SELECT = {
  id: true,
  schoolId: true,
  curriculumId: true,
  grantedAt: true,
  curriculum: {
    select: {
      status: true,
      audience: true,
      gradeLevel: { select: { id: true, name: true } },
      subject: { select: { id: true, name: true, status: true } },
    },
  },
} as const;

type EntitlementRow = Prisma.SchoolContentEntitlementGetPayload<{ select: typeof ENTITLEMENT_SELECT }>;

function toEntity(row: EntitlementRow): EntitlementEntity {
  return {
    audience: row.curriculum.audience,
    id: row.id,
    schoolId: row.schoolId,
    curriculumId: row.curriculumId,
    gradeLevelId: row.curriculum.gradeLevel.id,
    gradeLevelName: row.curriculum.gradeLevel.name,
    subjectId: row.curriculum.subject.id,
    subjectName: row.curriculum.subject.name,
    curriculumStatus: row.curriculum.status,
    grantedAt: row.grantedAt,
  };
}

// The SUPER_ADMIN grant path (F-06: "Grant school content entitlements"), deliberately
// kept apart from ContentEntitlementsService.
//
// That service's safety property is that no method accepts a school id — the tenant
// guard supplies it, so a caller cannot ask about another school. This service is the
// exact opposite: it is cross-tenant by design and takes an explicit schoolId. Merging
// the two would put a schoolId parameter on the request-scoped path and erode the
// invariant that makes it safe. It only runs behind EntitlementsAdminController's
// SUPER_ADMIN + @BypassTenantScope pairing, and is not exported from the module.
@Injectable()
export class ContentEntitlementsAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async listForSchool(schoolId: string): Promise<EntitlementEntity[]> {
    await this.requireSchool(schoolId);

    const rows = await this.prisma.schoolContentEntitlement.findMany({
      where: { schoolId },
      select: ENTITLEMENT_SELECT,
      orderBy: { grantedAt: 'asc' },
    });

    return rows.map(toEntity);
  }

  async getOverview(): Promise<EntitlementOverviewEntity> {
    const [schools, totalCurricula, grouped, audienceRows] = await Promise.all([
      this.prisma.school.findMany({
        orderBy: { name: 'asc' },
        select: { id: true, name: true, slug: true, status: true },
      }),
      this.prisma.curriculum.count(),
      this.prisma.schoolContentEntitlement.groupBy({
        by: ['schoolId'],
        _count: { _all: true },
      }),
      this.prisma.schoolContentEntitlement.findMany({
        select: { schoolId: true, curriculum: { select: { audience: true } } },
      }),
    ]);

    const totals = new Map(grouped.map((row) => [row.schoolId, row._count._all]));
    const audienceCounts = new Map<string, { student: number; teacher: number }>();
    for (const row of audienceRows) {
      const counts = audienceCounts.get(row.schoolId) ?? { student: 0, teacher: 0 };
      if (row.curriculum.audience === 'STUDENT') counts.student += 1;
      if (row.curriculum.audience === 'TEACHER') counts.teacher += 1;
      audienceCounts.set(row.schoolId, counts);
    }

    return {
      schools: schools.map((school) => {
        const counts = audienceCounts.get(school.id) ?? { student: 0, teacher: 0 };
        return {
          schoolId: school.id,
          schoolName: school.name,
          schoolSlug: school.slug,
          schoolStatus: school.status,
          studentCurricula: counts.student,
          teacherCurricula: counts.teacher,
          grantedCurricula: totals.get(school.id) ?? 0,
          totalCurricula,
        };
      }),
    };
  }

  async grant(schoolId: string, dto: GrantEntitlementDto): Promise<EntitlementEntity> {
    await this.requireSchool(schoolId);

    const curriculum = await this.prisma.curriculum.findUnique({
      where: { id: dto.curriculumId },
      select: { status: true, subject: { select: { status: true } } },
    });

    if (curriculum === null) {
      throw new NotFoundException('Curriculum not found');
    }
    // 409 rather than 404: the subject exists and this caller can see it in
    // GET /admin/subjects. Retirement stops *new* grants; grants already held stay live.
    if (curriculum.subject.status === SubjectStatus.RETIRED) {
      throw new ConflictException('This subject is retired and cannot be granted');
    }
    // An ARCHIVED curriculum is retired from new authoring, so it may not take new
    // grants either — but a DRAFT one may. Granting before publication is legitimate:
    // ContentEntitlementsService filters reads to PUBLISHED, so nothing leaks, and
    // requiring publish-before-grant would only create a sequencing trap for operators.
    if (curriculum.status === CurriculumStatus.ARCHIVED) {
      throw new ConflictException('This curriculum is archived and cannot be granted');
    }

    try {
      const row = await this.prisma.schoolContentEntitlement.create({
        data: { schoolId, curriculumId: dto.curriculumId },
        select: ENTITLEMENT_SELECT,
      });
      return toEntity(row);
    } catch (error) {
      // @@unique([schoolId, curriculumId]) — re-granting is a conflict, not a silent
      // no-op, so the caller learns the grant already existed.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('This school already holds an entitlement for that curriculum');
      }
      throw error;
    }
  }

  // Replaces the school's entire entitlement set in one call — the checkbox-matrix save on
  // the admin UI, so an operator can grant/restrict a whole grade or subject at once instead
  // of one curriculum per request.
  async replaceForSchool(schoolId: string, dto: ReplaceEntitlementsDto): Promise<EntitlementEntity[]> {
    await this.requireSchool(schoolId);

    // The client sends a set, but nothing stops a duplicate id arriving on the wire.
    const desired = [...new Set(dto.curriculumIds)];

    const [curricula, currentRows] = await this.prisma.$transaction([
      this.prisma.curriculum.findMany({
        where: { id: { in: desired } },
        select: { id: true, status: true, subject: { select: { status: true } } },
      }),
      this.prisma.schoolContentEntitlement.findMany({
        where: { schoolId },
        select: {
          id: true,
          curriculumId: true,
          curriculum: { select: { audience: true, subject: { select: { status: true } } } },
        },
      }),
    ]);

    const curriculumById = new Map(curricula.map((curriculum) => [curriculum.id, curriculum]));
    if (desired.some((id) => !curriculumById.has(id))) {
      throw new NotFoundException('Curriculum not found');
    }

    const currentIds = new Set(currentRows.map((row) => row.curriculumId));

    // Same rules as grant(): retirement and archival stop *new* grants, not ones already
    // held. The admin UI only ever offers grantable curricula, so either can appear here
    // only if it isn't already granted — reject that, exactly as a single grant() would.
    for (const id of desired) {
      const curriculum = curriculumById.get(id);
      if (curriculum === undefined || currentIds.has(id)) {
        continue;
      }
      if (curriculum.subject.status === SubjectStatus.RETIRED) {
        throw new ConflictException('This subject is retired and cannot be granted');
      }
      if (curriculum.status === CurriculumStatus.ARCHIVED) {
        throw new ConflictException('This curriculum is archived and cannot be granted');
      }
    }

    // The UI's grid only shows ACTIVE subjects, so a curriculum on a retired subject can
    // never appear in `desired`. Diffing against every current row would then mark it for
    // revocation on every save; scoping the diff to still-ACTIVE rows leaves it untouched,
    // matching the comment on grant(): "grants already held stay live".
    const desiredSet = new Set(desired);
    const toRevoke = currentRows.filter(
      (row) =>
        row.curriculum.subject.status !== SubjectStatus.RETIRED &&
        (dto.audience === undefined || row.curriculum.audience === dto.audience) &&
        !desiredSet.has(row.curriculumId),
    );
    const toGrant = desired.filter((id) => !currentIds.has(id));

    await this.prisma.$transaction([
      this.prisma.schoolContentEntitlement.deleteMany({
        where: { schoolId, id: { in: toRevoke.map((row) => row.id) } },
      }),
      // skipDuplicates makes a concurrent double-save idempotent instead of a P2002 500.
      this.prisma.schoolContentEntitlement.createMany({
        data: toGrant.map((curriculumId) => ({ schoolId, curriculumId })),
        skipDuplicates: true,
      }),
    ]);

    return this.listForSchool(schoolId);
  }

  async revoke(schoolId: string, entitlementId: string): Promise<void> {
    // Matched on both ids: an entitlement id from another school must read as missing
    // here, not silently revoke that school's grant.
    const { count } = await this.prisma.schoolContentEntitlement.deleteMany({
      where: { id: entitlementId, schoolId },
    });

    if (count === 0) {
      throw new NotFoundException('Entitlement not found');
    }
  }

  // Without this, granting against a nonexistent school would surface Prisma's raw
  // foreign-key violation as a 500 instead of a 404.
  private async requireSchool(schoolId: string): Promise<void> {
    const school = await this.prisma.school.count({ where: { id: schoolId } });
    if (school === 0) {
      throw new NotFoundException('School not found');
    }
  }
}
