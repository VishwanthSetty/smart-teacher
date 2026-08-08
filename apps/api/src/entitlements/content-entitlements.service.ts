import { Injectable } from '@nestjs/common';
import { CurriculumStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface EntitledCurriculum {
  curriculumId: string;
  // Carried alongside so ActorContentScopeService can narrow a student to their enrolled
  // grade without a second query — and without needing PrismaService of its own, which
  // would put data access on the wrong side of the scope seam.
  gradeLevelId: string;
}

// The gate in front of platform content (F-02's reviewed exception, consumed by F-21).
// Curriculum, ContentNode and Video carry no schoolId, so tenant scoping cannot restrict
// them directly; SchoolContentEntitlement is tenant-scoped and does it instead.
//
// No method here takes a school id. The tenant guard supplies it from the request
// context, so there is no parameter a caller could get wrong and no way to ask this
// service about another school's entitlements.
@Injectable()
export class ContentEntitlementsService {
  constructor(private readonly prisma: PrismaService) {}

  async isEntitled(curriculumId: string): Promise<boolean> {
    const matches = await this.prisma.schoolContentEntitlement.count({
      where: { curriculumId, curriculum: { status: CurriculumStatus.PUBLISHED } },
    });
    return matches > 0;
  }

  /**
   * For list endpoints, which filter platform content by the caller's entitlements
   * rather than checking one row at a time.
   *
   * The PUBLISHED filter lives here rather than at each call site: a DRAFT curriculum is
   * one an operator is still building, and a grant may legitimately be made before it is
   * published. Filtering once, at the only place entitlements become a scope, is what
   * stops a half-built tree reaching a school through some read path that forgot to ask.
   *
   * The nested `curriculum` select is a to-one include of a platform-global model from a
   * tenant-scoped root — the shape the tenant guard's walker allows. The refused shape is
   * the reverse (a to-one include of a tenant-scoped model from a non-scoped parent).
   */
  async listEntitledCurricula(): Promise<EntitledCurriculum[]> {
    const rows = await this.prisma.schoolContentEntitlement.findMany({
      where: { curriculum: { status: CurriculumStatus.PUBLISHED } },
      select: { curriculumId: true, curriculum: { select: { gradeLevelId: true } } },
      orderBy: { grantedAt: 'asc' },
    });

    return rows.map((row) => ({
      curriculumId: row.curriculumId,
      gradeLevelId: row.curriculum.gradeLevelId,
    }));
  }
}
