import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SubjectStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GrantEntitlementDto } from './dto/grant-entitlement.dto';
import { EntitlementEntity } from './entities/entitlement.entity';

const ENTITLEMENT_SELECT = {
  id: true,
  schoolId: true,
  grantedAt: true,
  gradeLevel: { select: { id: true, name: true } },
  subject: { select: { id: true, name: true } },
} as const;

type EntitlementRow = Prisma.SchoolContentEntitlementGetPayload<{ select: typeof ENTITLEMENT_SELECT }>;

function toEntity(row: EntitlementRow): EntitlementEntity {
  return {
    id: row.id,
    schoolId: row.schoolId,
    gradeLevelId: row.gradeLevel.id,
    gradeLevelName: row.gradeLevel.name,
    subjectId: row.subject.id,
    subjectName: row.subject.name,
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

  async grant(schoolId: string, dto: GrantEntitlementDto): Promise<EntitlementEntity> {
    await this.requireSchool(schoolId);

    const [gradeLevel, subject] = await this.prisma.$transaction([
      this.prisma.gradeLevel.count({ where: { id: dto.gradeLevelId } }),
      this.prisma.subject.findUnique({ where: { id: dto.subjectId }, select: { status: true } }),
    ]);

    if (gradeLevel === 0) {
      throw new NotFoundException('Grade level not found');
    }
    if (subject === null) {
      throw new NotFoundException('Subject not found');
    }
    // 409 rather than 404: the subject exists and this caller can see it in
    // GET /admin/subjects. Retirement stops *new* grants; grants already held stay live.
    if (subject.status === SubjectStatus.RETIRED) {
      throw new ConflictException('This subject is retired and cannot be granted');
    }

    try {
      const row = await this.prisma.schoolContentEntitlement.create({
        data: { schoolId, gradeLevelId: dto.gradeLevelId, subjectId: dto.subjectId },
        select: ENTITLEMENT_SELECT,
      });
      return toEntity(row);
    } catch (error) {
      // @@unique([schoolId, gradeLevelId, subjectId]) — re-granting is a conflict, not a
      // silent no-op, so the caller learns the grant already existed.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('This school already holds an entitlement for that grade level and subject');
      }
      throw error;
    }
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
