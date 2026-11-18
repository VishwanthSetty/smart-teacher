import { Injectable } from '@nestjs/common';
import { EnrollmentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const ENROLLMENT_PROFILE_SELECT = {
  id: true,
  sectionId: true,
  rollNumber: true,
  isCurrent: true,
  section: {
    select: {
      name: true,
      gradeLevel: { select: { id: true, name: true, rank: true } },
    },
  },
} as const;

export type ActiveEnrollmentProfile = Prisma.EnrollmentGetPayload<{
  select: typeof ENROLLMENT_PROFILE_SELECT;
}>;

// Current first, then oldest. The current row normally comes first by itself; startedAt
// keeps the result deterministic if the one-current invariant were ever broken, so no read
// here is ever an arbitrary pick.
const CURRENT_FIRST: Prisma.EnrollmentOrderByWithRelationInput[] = [
  { isCurrent: 'desc' },
  { startedAt: 'asc' },
];

// Read-only half of the enrollment seam, deliberately split from EnrollmentsService and
// given its own leaf module: EnrollmentsService fans tasks out on enrolment and so pulls
// in TasksModule, which needs EntitlementsModule, which needs this lookup for the STUDENT
// content-scope narrowing. Keeping the reads in a provider whose only dependency is
// Prisma turns that module cycle into a straight line instead of a forwardRef chain.
@Injectable()
export class EnrollmentLookupService {
  constructor(private readonly prisma: PrismaService) {}

  // Every grade level the student is actively enrolled in — what they may *open*.
  // An empty array means "sees nothing", never "sees everything".
  async activeGradeLevelIdsFor(userId: string): Promise<string[]> {
    const rows = await this.prisma.enrollment.findMany({
      where: { userId, status: EnrollmentStatus.ACTIVE },
      select: { section: { select: { gradeLevelId: true } } },
    });
    return [...new Set(rows.map((row) => row.section.gradeLevelId))];
  }

  // The grade level of the class the student is currently in — what they *browse*.
  async currentGradeLevelIdFor(userId: string): Promise<string | null> {
    const enrollment = await this.prisma.enrollment.findFirst({
      where: { userId, status: EnrollmentStatus.ACTIVE },
      orderBy: CURRENT_FIRST,
      select: { section: { select: { gradeLevelId: true } } },
    });
    return enrollment?.section.gradeLevelId ?? null;
  }

  async currentSectionIdFor(userId: string): Promise<string | null> {
    const enrollment = await this.prisma.enrollment.findFirst({
      where: { userId, status: EnrollmentStatus.ACTIVE },
      orderBy: CURRENT_FIRST,
      select: { sectionId: true },
    });
    return enrollment?.sectionId ?? null;
  }

  activeProfilesFor(userId: string): Promise<ActiveEnrollmentProfile[]> {
    return this.prisma.enrollment.findMany({
      where: { userId, status: EnrollmentStatus.ACTIVE },
      orderBy: CURRENT_FIRST,
      select: ENROLLMENT_PROFILE_SELECT,
    });
  }
}
