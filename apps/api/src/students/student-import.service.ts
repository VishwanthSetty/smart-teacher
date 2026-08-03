import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EnrollmentStatus, Prisma, Role, StudentImportBatchStatus, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { InvitesService } from '../invites/invites.service';
import { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { EnrollmentsService } from './enrollments.service';
import {
  CREATE_CHUNK_SIZE,
  DRAFT_BATCH_TTL_MS,
  MAX_IMPORT_FILE_BYTES,
} from './student-import.constants';
import {
  parseStudentCsv,
  type ParsedStudentRow,
  type StudentImportRowError,
  type StudentImportRowIssue,
  type StudentImportWarning,
} from './student-import.parser';
import { buildErrorReportCsv } from './student-import-csv';
import {
  StudentImportPreviewEntity,
  StudentImportResultEntity,
} from './entities/student-import.entity';

const CSV_MIME_TYPES = ['text/csv', 'application/csv', 'text/plain', 'application/vnd.ms-excel'];

interface StoredBatch {
  id: string;
  fileName: string;
  status: StudentImportBatchStatus;
  totalRows: number;
  validCount: number;
  invalidCount: number;
  validRows: Prisma.JsonValue;
  invalidRows: Prisma.JsonValue;
  warnings: Prisma.JsonValue;
  createdAt: Date;
}

const BATCH_SELECT = {
  id: true,
  fileName: true,
  status: true,
  totalRows: true,
  validCount: true,
  invalidCount: true,
  validRows: true,
  invalidRows: true,
  warnings: true,
  createdAt: true,
} as const;

interface ResolvedSection {
  id: string;
}

@Injectable()
export class StudentImportService {
  private readonly logger = new Logger(StudentImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly invitesService: InvitesService,
    private readonly mailService: MailService,
    private readonly enrollments: EnrollmentsService,
  ) {}

  // Parses and validates, then persists a DRAFT batch and nothing else. The admin sees
  // the preview before a single user row exists — that is the whole point of the two-step
  // handshake, so nothing in here may write to User or Enrollment.
  async createBatch(
    file: Express.Multer.File,
    actor: AuthenticatedUser,
  ): Promise<StudentImportPreviewEntity> {
    if (!actor.schoolId) {
      throw new ForbiddenException('A platform user cannot import students');
    }

    this.assertLooksLikeCsv(file);

    const parsed = parseStudentCsv(file.buffer);
    const { rows, rowErrors } = await this.applyDatabaseValidation(
      this.prisma,
      parsed.rows,
      parsed.rowErrors,
    );

    await this.pruneStaleDrafts();

    const batch = await this.prisma.studentImportBatch.create({
      data: {
        // Passed explicitly the way SectionsService.create/StudentsService.create do: the
        // tenant guard would stamp it anyway, but it is a required create-input field and
        // the guard's mismatch check verifies this value rather than trusting it.
        schoolId: actor.schoolId,
        createdById: actor.sub,
        fileName: file.originalname,
        status: StudentImportBatchStatus.DRAFT,
        totalRows: parsed.totalRows,
        validCount: rows.length,
        invalidCount: rowErrors.length,
        validRows: rows as unknown as Prisma.InputJsonValue,
        invalidRows: rowErrors as unknown as Prisma.InputJsonValue,
        warnings: parsed.warnings as unknown as Prisma.InputJsonValue,
      },
      select: BATCH_SELECT,
    });

    return this.toPreview(batch);
  }

  async getBatch(batchId: string): Promise<StudentImportPreviewEntity> {
    const batch = await this.findBatchOrThrow(batchId);
    return this.toPreview(batch);
  }

  async buildErrorReport(batchId: string): Promise<string> {
    const batch = await this.findBatchOrThrow(batchId);
    return buildErrorReportCsv(this.readRowErrors(batch.invalidRows));
  }

  // Writes the valid rows. Invalid rows were filtered out before the transaction opens,
  // so a bad row can never abort the file — partial success is the required behaviour.
  async confirmBatch(batchId: string, actor: AuthenticatedUser): Promise<StudentImportResultEntity> {
    if (!actor.schoolId) {
      throw new ForbiddenException('A platform user cannot import students');
    }

    const batch = await this.findBatchOrThrow(batchId);
    if (batch.status === StudentImportBatchStatus.COMMITTED) {
      throw new ConflictException('This import has already been confirmed');
    }

    const school = await this.prisma.school.findUnique({
      where: { id: actor.schoolId },
      select: { name: true, slug: true },
    });
    if (!school) {
      throw new NotFoundException('School not found');
    }

    const schoolId = actor.schoolId;
    const candidateRows = this.readValidRows(batch.validRows);
    const knownErrors = this.readRowErrors(batch.invalidRows);

    let created: { id: string; email: string; name: string; inviteToken: string }[] = [];
    let finalErrors: StudentImportRowError[] = knownErrors;

    try {
      ({ created, finalErrors } = await this.prisma.$transaction(
        async (tx) => {
          // The world may have moved since the preview: another admin could have created
          // one of these students, added or removed a section, or taken a roll number.
          // Re-validating inside the transaction turns that into a skipped row instead of
          // a failed file.
          const { rows, rowErrors, sectionIdByRow } = await this.applyDatabaseValidation(
            tx,
            candidateRows,
            knownErrors,
          );

          const createdRows: typeof created = [];

          for (let index = 0; index < rows.length; index += CREATE_CHUNK_SIZE) {
            const chunk = rows.slice(index, index + CREATE_CHUNK_SIZE);
            const invites = chunk.map(() => this.invitesService.mintToken());

            const users = await tx.user.createManyAndReturn({
              data: chunk.map((row, offset) => ({
                schoolId,
                email: row.email,
                name: `${row.firstName} ${row.lastName}`,
                firstName: row.firstName,
                lastName: row.lastName,
                role: Role.STUDENT,
                status: UserStatus.PENDING,
                inviteTokenHash: invites[offset].tokenHash,
                inviteTokenExpiresAt: invites[offset].expiresAt,
              })),
              select: { id: true, email: true },
            });

            const byEmail = new Map(users.map((user) => [user.email, user.id]));

            // Enrollments are written in the same transaction as their users: that is what
            // makes a crash mid-import incapable of leaving a student without a placement.
            const enrollInputs = chunk.flatMap((row) => {
              const userId = byEmail.get(row.email);
              const sectionId = sectionIdByRow.get(row.rowNumber);
              if (!userId || !sectionId) {
                return [];
              }
              return [{ schoolId, userId, sectionId, rollNumber: row.rollNumber }];
            });

            await this.enrollments.enrollMany(tx, enrollInputs);

            chunk.forEach((row, offset) => {
              const id = byEmail.get(row.email);
              if (id) {
                createdRows.push({
                  id,
                  email: row.email,
                  name: `${row.firstName} ${row.lastName}`,
                  inviteToken: invites[offset].token,
                });
              }
            });
          }

          await tx.studentImportBatch.update({
            where: { id: batch.id },
            data: {
              status: StudentImportBatchStatus.COMMITTED,
              committedAt: new Date(),
              validCount: rows.length,
              invalidCount: rowErrors.length,
              validRows: rows as unknown as Prisma.InputJsonValue,
              invalidRows: rowErrors as unknown as Prisma.InputJsonValue,
            },
          });

          return { created: createdRows, finalErrors: rowErrors };
        },
        { maxWait: 10_000, timeout: 60_000 },
      ));
    } catch (error) {
      // A P2002 here means someone created one of these emails, or claimed one of these
      // roll numbers, between the in-transaction re-check and the insert. An honest
      // all-or-nothing failure beats a silent partial write; the admin re-uploads and sees
      // the current state.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(
          'The file changed while you were confirming. Re-upload it to see the current state.',
        );
      }
      throw error;
    }

    const { invitesSent, invitesFailed } = await this.dispatchInvites(created, school);

    return {
      batchId: batch.id,
      createdCount: created.length,
      skippedCount: finalErrors.length,
      invitesSent,
      invitesFailed,
      invalidRows: finalErrors,
    };
  }

  // Invites go out only after the transaction commits, and a failure is counted rather
  // than thrown: the student already exists as PENDING and POST /users/:id/resend-invite
  // is the repair path. Rolling back a whole import over one bad mailbox would be worse.
  private async dispatchInvites(
    created: { email: string; name: string; inviteToken: string }[],
    school: { name: string; slug: string },
  ): Promise<{ invitesSent: number; invitesFailed: number }> {
    let invitesSent = 0;
    let invitesFailed = 0;

    for (const student of created) {
      try {
        await this.mailService.sendUserInvite({
          email: student.email,
          name: student.name,
          role: Role.STUDENT,
          schoolName: school.name,
          schoolSlug: school.slug,
          inviteToken: student.inviteToken,
        });
        invitesSent += 1;
      } catch (error) {
        invitesFailed += 1;
        this.logger.error(
          `Failed to send bulk-import invite to ${student.email}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }

    return { invitesSent, invitesFailed };
  }

  // Shared by preview and confirm so both apply exactly the same rules — a row that
  // previewed as valid can only become invalid because the database changed, never
  // because the two paths disagree. Returns the resolved section id per row number so
  // the commit transaction does not have to repeat the section lookup.
  private async applyDatabaseValidation(
    client: Pick<PrismaService, 'user' | 'section' | 'enrollment'>,
    rows: ParsedStudentRow[],
    existingErrors: StudentImportRowError[],
  ): Promise<{
    rows: ParsedStudentRow[];
    rowErrors: StudentImportRowError[];
    sectionIdByRow: Map<number, string>;
  }> {
    if (rows.length === 0) {
      return { rows: [], rowErrors: [...existingErrors], sectionIdByRow: new Map() };
    }

    const takenEmails = await this.findTakenEmails(client, rows);
    const sectionsByKey = await this.resolveSections(client);
    const knownGradeLevels = new Set(
      [...sectionsByKey.keys()].map((key) => key.split('|')[0]),
    );

    const valid: ParsedStudentRow[] = [];
    const rowErrors = [...existingErrors];
    const sectionIdByRow = new Map<number, string>();

    // Rows that resolve to a real section still need their roll number checked against
    // rows already active in the DB — collected first so one query covers every row.
    const candidateSectionIds = new Set<string>();
    const candidateRollNumbers = new Set<string>();
    const resolvedSectionByRow = new Map<number, ResolvedSection>();

    for (const row of rows) {
      const key = `${row.gradeLevel.toLowerCase()}|${row.section.toLowerCase()}`;
      const section = sectionsByKey.get(key);
      if (section) {
        resolvedSectionByRow.set(row.rowNumber, section);
        if (row.rollNumber) {
          candidateSectionIds.add(section.id);
          candidateRollNumbers.add(row.rollNumber);
        }
      }
    }

    const takenRolls = await this.findTakenRollNumbers(
      client,
      candidateSectionIds,
      candidateRollNumbers,
    );

    for (const row of rows) {
      const errors: StudentImportRowIssue[] = [];

      if (takenEmails.has(row.email)) {
        errors.push({
          code: 'DUPLICATE_EXISTING',
          message: 'A user with this email already exists in this school.',
        });
      }

      const section = resolvedSectionByRow.get(row.rowNumber);
      if (!section) {
        if (!knownGradeLevels.has(row.gradeLevel.toLowerCase())) {
          errors.push({
            code: 'UNKNOWN_GRADE_LEVEL',
            message: `"${row.gradeLevel}" is not a grade level with sections in this school.`,
          });
        } else {
          errors.push({
            code: 'UNKNOWN_SECTION',
            message: `No section "${row.section}" exists for ${row.gradeLevel}. Create the section first.`,
          });
        }
      } else if (row.rollNumber && takenRolls.has(`${section.id}|${row.rollNumber.toLowerCase()}`)) {
        errors.push({
          code: 'ROLL_NUMBER_TAKEN',
          message: `Roll number ${row.rollNumber} is already used in ${row.gradeLevel} - ${row.section}.`,
        });
      }

      if (errors.length > 0) {
        rowErrors.push({
          rowNumber: row.rowNumber,
          firstName: row.firstName,
          lastName: row.lastName,
          email: row.email,
          gradeLevel: row.gradeLevel,
          section: row.section,
          rollNumber: row.rollNumber ?? '',
          errors,
        });
        continue;
      }

      if (section) {
        sectionIdByRow.set(row.rowNumber, section.id);
      }
      valid.push(row);
    }

    rowErrors.sort((a, b) => a.rowNumber - b.rowNumber);

    return { rows: valid, rowErrors, sectionIdByRow };
  }

  private async findTakenEmails(
    client: Pick<PrismaService, 'user'>,
    rows: ParsedStudentRow[],
  ): Promise<Set<string>> {
    // Tenant-scoped automatically: this only ever sees the caller's own school, which is
    // also why a student of another school is not a duplicate here.
    const existing = await client.user.findMany({
      where: { email: { in: rows.map((row) => row.email) } },
      select: { email: true },
    });
    return new Set(existing.map((user) => user.email));
  }

  // One query for every section in the school, keyed by (gradeLevel name, section name)
  // lowercased. This is a tenant-scoped root (Section) with a to-one include of the
  // platform-global GradeLevel, which is the safe include direction — never query
  // GradeLevel and include `sections` (see the hazard comment in schema.prisma).
  private async resolveSections(
    client: Pick<PrismaService, 'section'>,
  ): Promise<Map<string, ResolvedSection>> {
    const sections = await client.section.findMany({
      select: { id: true, name: true, gradeLevel: { select: { name: true } } },
    });
    return new Map(
      sections.map((section) => [
        `${section.gradeLevel.name.toLowerCase()}|${section.name.toLowerCase()}`,
        { id: section.id },
      ]),
    );
  }

  private async findTakenRollNumbers(
    client: Pick<PrismaService, 'enrollment'>,
    sectionIds: Set<string>,
    rollNumbers: Set<string>,
  ): Promise<Set<string>> {
    if (sectionIds.size === 0 || rollNumbers.size === 0) {
      return new Set();
    }
    const taken = await client.enrollment.findMany({
      where: {
        status: EnrollmentStatus.ACTIVE,
        sectionId: { in: [...sectionIds] },
        rollNumber: { in: [...rollNumbers] },
      },
      select: { sectionId: true, rollNumber: true },
    });
    return new Set(
      taken
        .filter((enrollment): enrollment is typeof enrollment & { rollNumber: string } => enrollment.rollNumber !== null)
        .map((enrollment) => `${enrollment.sectionId}|${enrollment.rollNumber.toLowerCase()}`),
    );
  }

  // Opportunistic, like LoginThrottleService's attempt pruning — a staging table does not
  // justify a scheduler, and the next upload is a natural moment to clear the last one.
  private async pruneStaleDrafts(): Promise<void> {
    await this.prisma.studentImportBatch.deleteMany({
      where: {
        status: StudentImportBatchStatus.DRAFT,
        createdAt: { lt: new Date(Date.now() - DRAFT_BATCH_TTL_MS) },
      },
    });
  }

  // Tenant-scoped, so another school's batch simply is not found — a 404 rather than a
  // 403, which would confirm the id exists.
  private async findBatchOrThrow(batchId: string): Promise<StoredBatch> {
    const batch = await this.prisma.studentImportBatch.findUnique({
      where: { id: batchId },
      select: BATCH_SELECT,
    });
    if (!batch) {
      throw new NotFoundException('Import not found');
    }
    return batch;
  }

  private assertLooksLikeCsv(file: Express.Multer.File): void {
    if (file.size > MAX_IMPORT_FILE_BYTES) {
      throw new BadRequestException(
        'This file is larger than the 5 MB limit. Split it and upload in parts.',
      );
    }
    const hasCsvExtension = file.originalname.toLowerCase().endsWith('.csv');
    if (!hasCsvExtension && !CSV_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException('Upload a .csv file. Excel workbooks (.xlsx) are not supported.');
    }
  }

  private toPreview(batch: StoredBatch): StudentImportPreviewEntity {
    return {
      batchId: batch.id,
      fileName: batch.fileName,
      status: batch.status,
      totalRows: batch.totalRows,
      validCount: batch.validCount,
      invalidCount: batch.invalidCount,
      validRows: this.readValidRows(batch.validRows),
      invalidRows: this.readRowErrors(batch.invalidRows),
      warnings: (batch.warnings ?? []) as unknown as StudentImportWarning[],
      createdAt: batch.createdAt,
    };
  }

  // Json columns come back as Prisma.JsonValue; this service is the only writer, so the
  // cast is narrowing our own serialisation rather than trusting external input.
  private readValidRows(value: Prisma.JsonValue): ParsedStudentRow[] {
    return (value ?? []) as unknown as ParsedStudentRow[];
  }

  private readRowErrors(value: Prisma.JsonValue): StudentImportRowError[] {
    return (value ?? []) as unknown as StudentImportRowError[];
  }
}
