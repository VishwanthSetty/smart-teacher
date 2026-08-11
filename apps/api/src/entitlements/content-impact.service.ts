import { Injectable, NotFoundException } from '@nestjs/common';
import { EnrollmentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ContentImpactEntity } from './entities/content-impact.entity';

/** Cross-tenant aggregate for operator warnings. It returns counts only, never rows. */
@Injectable()
export class ContentImpactService {
  constructor(private readonly prisma: PrismaService) {}

  async get(curriculumId: string): Promise<ContentImpactEntity> {
    const curriculum = await this.prisma.curriculum.findUnique({
      where: { id: curriculumId },
      select: { id: true, gradeLevelId: true, subjectId: true, audience: true },
    });
    if (curriculum === null) {
      throw new NotFoundException('Curriculum not found');
    }

    const entitlements = await this.prisma.schoolContentEntitlement.findMany({
      where: { curriculumId },
      select: { schoolId: true },
    });
    const schoolIds = entitlements.map(({ schoolId }) => schoolId);
    const [studentCount, teacherCount, videoCount, documentCount] = await this.prisma.$transaction([
      this.prisma.enrollment.count({
        where: {
          schoolId: { in: schoolIds },
          status: EnrollmentStatus.ACTIVE,
          section: { gradeLevelId: curriculum.gradeLevelId },
        },
      }),
      this.prisma.teacherAssignment.count({
        where: {
          schoolId: { in: schoolIds },
          gradeLevelId: curriculum.gradeLevelId,
          subjectId: curriculum.subjectId,
        },
      }),
      this.prisma.video.count({ where: { node: { curriculumId } } }),
      this.prisma.document.count({ where: { node: { curriculumId } } }),
    ]);
    return {
      audience: curriculum.audience,
      curriculumId: curriculum.id,
      gradeLevelId: curriculum.gradeLevelId,
      subjectId: curriculum.subjectId,
      schoolCount: schoolIds.length,
      studentCount,
      videoCount,
      documentCount,
      teacherCount,
    };
  }
}
