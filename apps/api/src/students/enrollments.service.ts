import { Injectable, NotFoundException } from '@nestjs/common';
import { EnrollmentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TasksService } from '../tasks/tasks.service';

// Structural, not Prisma.TransactionClient: PrismaService is the tenant-guard-extended
// client, and $transaction's callback argument has that same extended shape, not the
// bare generic one — a nominal TransactionClient type does not match it structurally.
// Same fix as TeacherImportService's `Pick<PrismaService, 'user' | 'subject'>`.
type TxClient = Pick<
  PrismaService,
  'enrollment' | 'task' | 'resourceActivity' | 'taskAssignment' | 'notification'
>;

export interface EnrollInput {
  schoolId: string;
  userId: string;
  sectionId: string;
  rollNumber?: string | null;
}

export const ENROLLMENT_WITH_SECTION_INCLUDE = {
  section: { include: { gradeLevel: true } },
} as const;

export type EnrollmentWithSection = Prisma.EnrollmentGetPayload<{
  include: typeof ENROLLMENT_WITH_SECTION_INCLUDE;
}>;

// The only place that knows how an enrollment is opened, closed and made current. Being
// the sole writer is what upholds "a student with any ACTIVE enrollment has exactly one
// current one": the partial index caps it at one, and every path here that could leave
// zero promotes a replacement in the same transaction. Reads live in
// EnrollmentLookupService so that content-scope narrowing can share them without
// inheriting this service's dependency on task fan-out.
@Injectable()
export class EnrollmentsService {
  constructor(private readonly tasks: TasksService) {}

  // Adding a class never moves the student out of the one they are using; the new row
  // becomes current only when it is their first ACTIVE enrollment.
  async enroll(tx: TxClient, input: EnrollInput): Promise<EnrollmentWithSection> {
    const existing = await tx.enrollment.count({
      where: { userId: input.userId, status: EnrollmentStatus.ACTIVE },
    });
    const enrollment = await tx.enrollment.create({
      data: {
        schoolId: input.schoolId,
        userId: input.userId,
        sectionId: input.sectionId,
        rollNumber: input.rollNumber ?? null,
        isCurrent: existing === 0,
      },
      include: ENROLLMENT_WITH_SECTION_INCLUDE,
    });
    await this.tasks.backfillForNewEnrollment(
      tx,
      input.schoolId,
      input.userId,
      input.sectionId,
    );
    return enrollment;
  }

  // Replaces one class with another in place: the new row inherits `isCurrent` from the
  // one it replaces, so moving the student's current class keeps them in it.
  async replace(
    tx: TxClient,
    current: EnrollmentWithSection,
    input: EnrollInput,
  ): Promise<EnrollmentWithSection> {
    await this.closeRow(tx, current.id);
    const enrollment = await tx.enrollment.create({
      data: {
        schoolId: input.schoolId,
        userId: input.userId,
        sectionId: input.sectionId,
        rollNumber: input.rollNumber ?? null,
        isCurrent: current.isCurrent,
      },
      include: ENROLLMENT_WITH_SECTION_INCLUDE,
    });
    await this.tasks.backfillForNewEnrollment(
      tx,
      input.schoolId,
      input.userId,
      input.sectionId,
    );
    return enrollment;
  }

  // Ends one class. When it was the current one, the oldest remaining ACTIVE class takes
  // over so the student is never left with classes but no current class.
  async end(tx: TxClient, userId: string, enrollmentId: string): Promise<void> {
    const target = await this.findActiveOwned(tx, userId, enrollmentId);
    await this.closeRow(tx, target.id);
    if (!target.isCurrent) {
      return;
    }
    const successor = await tx.enrollment.findFirst({
      where: { userId, status: EnrollmentStatus.ACTIVE },
      orderBy: { startedAt: 'asc' },
      select: { id: true },
    });
    if (successor) {
      await tx.enrollment.update({ where: { id: successor.id }, data: { isCurrent: true } });
    }
  }

  // Clear before set: the partial unique index on (userId) WHERE isCurrent is checked per
  // statement, so setting the target first would collide with the old current row.
  async switchCurrent(tx: TxClient, userId: string, enrollmentId: string): Promise<void> {
    const target = await this.findActiveOwned(tx, userId, enrollmentId);
    if (target.isCurrent) {
      return;
    }
    await tx.enrollment.updateMany({
      where: { userId, status: EnrollmentStatus.ACTIVE, isCurrent: true },
      data: { isCurrent: false },
    });
    await tx.enrollment.update({ where: { id: target.id }, data: { isCurrent: true } });
  }

  // Bulk counterpart to `enroll`, for StudentImportService: a chunk of brand-new users
  // never has a prior ACTIVE enrollment, so each row is that student's current class and
  // this is a plain createMany rather than N round trips.
  async enrollMany(tx: TxClient, inputs: EnrollInput[]): Promise<void> {
    if (inputs.length === 0) {
      return;
    }
    await tx.enrollment.createMany({
      data: inputs.map((input) => ({
        schoolId: input.schoolId,
        userId: input.userId,
        sectionId: input.sectionId,
        rollNumber: input.rollNumber ?? null,
        isCurrent: true,
      })),
    });
    for (const input of inputs) {
      await this.tasks.backfillForNewEnrollment(
        tx,
        input.schoolId,
        input.userId,
        input.sectionId,
      );
    }
  }

  // Missing, ENDED and another student's enrollment all collapse into the same 404, so a
  // caller can never probe for enrollment ids they do not own.
  private async findActiveOwned(
    tx: TxClient,
    userId: string,
    enrollmentId: string,
  ): Promise<{ id: string; isCurrent: boolean }> {
    const enrollment = await tx.enrollment.findFirst({
      where: { id: enrollmentId, userId, status: EnrollmentStatus.ACTIVE },
      select: { id: true, isCurrent: true },
    });
    if (!enrollment) {
      throw new NotFoundException('Enrollment not found');
    }
    return enrollment;
  }

  private async closeRow(tx: TxClient, enrollmentId: string): Promise<void> {
    await tx.enrollment.update({
      where: { id: enrollmentId },
      data: { status: EnrollmentStatus.ENDED, endedAt: new Date(), isCurrent: false },
    });
  }
}
