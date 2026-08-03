import { Injectable } from '@nestjs/common';
import { EnrollmentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ContentImpactEntity } from './entities/content-impact.entity';

/** Cross-tenant aggregate for operator warnings. It returns counts only, never rows. */
@Injectable()
export class ContentImpactService {
  constructor(private readonly prisma: PrismaService) {}

  async get(gradeLevelId: string, subjectId: string): Promise<ContentImpactEntity> {
    const entitlements = await this.prisma.schoolContentEntitlement.findMany({
      where: { gradeLevelId, subjectId },
      select: { schoolId: true },
    });
    const schoolIds = entitlements.map(({ schoolId }) => schoolId);
    const [studentCount, videoCount] = await this.prisma.$transaction([
      this.prisma.enrollment.count({
        where: {
          schoolId: { in: schoolIds },
          status: EnrollmentStatus.ACTIVE,
          section: { gradeLevelId },
        },
      }),
      this.prisma.video.count({ where: { gradeLevelId, subjectId } }),
    ]);
    return {
      gradeLevelId,
      subjectId,
      schoolCount: schoolIds.length,
      studentCount,
      videoCount,
    };
  }
}
