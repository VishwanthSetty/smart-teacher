import { Injectable } from '@nestjs/common';
import { EnrollmentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// Structural, not Prisma.TransactionClient: PrismaService is the tenant-guard-extended
// client, and $transaction's callback argument has that same extended shape, not the
// bare generic one — a nominal TransactionClient type does not match it structurally.
// Same fix as TeacherImportService's `Pick<PrismaService, 'user' | 'subject'>`.
type TxClient = Pick<PrismaService, 'enrollment'>;

export interface EnrollInput {
  schoolId: string;
  userId: string;
  sectionId: string;
  rollNumber?: string | null;
}

export type EnrollmentWithSection = Prisma.EnrollmentGetPayload<{
  include: { section: { include: { gradeLevel: true } } };
}>;

export type ActiveEnrollmentProfile = Prisma.EnrollmentGetPayload<{
  select: {
    id: true;
    sectionId: true;
    rollNumber: true;
    section: {
      select: {
        name: true;
        gradeLevel: { select: { id: true; name: true; rank: true } };
      };
    };
  };
}>;

// The seam ActorContentScopeService depends on, and the only place that knows how an
// enrollment is opened, closed and read. Kept small and framework-thin so both
// StudentsService and the content-scope narrowing can share it without a cycle.
@Injectable()
export class EnrollmentsService {
  constructor(private readonly prisma: PrismaService) {}

  // The one query that answers "which grade level is this student in right now?".
  // Returns null for a student with no ACTIVE enrollment; callers must treat that as
  // "sees nothing", never as "sees everything".
  async activeGradeLevelIdFor(userId: string): Promise<string | null> {
    const enrollment = await this.prisma.enrollment.findFirst({
      where: { userId, status: EnrollmentStatus.ACTIVE },
      select: { section: { select: { gradeLevelId: true } } },
    });
    return enrollment?.section.gradeLevelId ?? null;
  }

  activeProfileFor(userId: string): Promise<ActiveEnrollmentProfile | null> {
    return this.prisma.enrollment.findFirst({
      where: { userId, status: EnrollmentStatus.ACTIVE },
      select: {
        id: true,
        sectionId: true,
        rollNumber: true,
        section: {
          select: {
            name: true,
            gradeLevel: { select: { id: true, name: true, rank: true } },
          },
        },
      },
    });
  }

  async endActive(tx: TxClient, userId: string): Promise<void> {
    await tx.enrollment.updateMany({
      where: { userId, status: EnrollmentStatus.ACTIVE },
      data: { status: EnrollmentStatus.ENDED, endedAt: new Date() },
    });
  }

  enroll(tx: TxClient, input: EnrollInput): Promise<EnrollmentWithSection> {
    return tx.enrollment.create({
      data: {
        schoolId: input.schoolId,
        userId: input.userId,
        sectionId: input.sectionId,
        rollNumber: input.rollNumber ?? null,
      },
      include: { section: { include: { gradeLevel: true } } },
    });
  }

  // Bulk counterpart to `enroll`, for StudentImportService: a chunk of brand-new users
  // never has a prior ACTIVE enrollment to end, so this is a plain createMany rather than
  // N round trips of endActive+enroll.
  async enrollMany(tx: Pick<PrismaService, 'enrollment'>, inputs: EnrollInput[]): Promise<void> {
    if (inputs.length === 0) {
      return;
    }
    await tx.enrollment.createMany({
      data: inputs.map((input) => ({
        schoolId: input.schoolId,
        userId: input.userId,
        sectionId: input.sectionId,
        rollNumber: input.rollNumber ?? null,
      })),
    });
  }
}
