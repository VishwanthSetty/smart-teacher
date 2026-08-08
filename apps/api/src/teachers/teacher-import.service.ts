import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role, SubjectStatus, TeacherImportBatchStatus, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { PasswordsService } from '../passwords/passwords.service';
import { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import {
  CREATE_CHUNK_SIZE,
  DRAFT_BATCH_TTL_MS,
  MAX_IMPORT_FILE_BYTES,
} from './teacher-import.constants';
import {
  parseTeacherCsv,
  type ParsedTeacherRow,
  type TeacherImportRowError,
  type TeacherImportRowIssue,
  type TeacherImportWarning,
} from './teacher-import.parser';
import { buildErrorReportCsv } from './teacher-import-csv';
import {
  TeacherImportPreviewEntity,
  TeacherImportResultEntity,
} from './entities/teacher-import.entity';

const CSV_MIME_TYPES = ['text/csv', 'application/csv', 'text/plain', 'application/vnd.ms-excel'];

interface StoredBatch {
  id: string;
  fileName: string;
  status: TeacherImportBatchStatus;
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

interface ResolvedSubject {
  id: string;
  status: SubjectStatus;
}

@Injectable()
export class TeacherImportService {
  private readonly logger = new Logger(TeacherImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordsService,
    private readonly mailService: MailService,
  ) {}

  // Parses and validates, then persists a DRAFT batch and nothing else. The admin sees
  // the preview before a single user row exists — that is the whole point of the two-step
  // handshake, so nothing in here may write to User or TeacherAssignment.
  async createBatch(
    file: Express.Multer.File,
    actor: AuthenticatedUser,
  ): Promise<TeacherImportPreviewEntity> {
    if (!actor.schoolId) {
      throw new ForbiddenException('A platform user cannot import teachers');
    }

    this.assertLooksLikeCsv(file);

    const parsed = parseTeacherCsv(file.buffer);
    const { rows, rowErrors } = await this.applyDatabaseValidation(
      this.prisma,
      parsed.rows,
      parsed.rowErrors,
    );

    await this.pruneStaleDrafts();

    const batch = await this.prisma.teacherImportBatch.create({
      data: {
        // Passed explicitly the way UsersService.create does: the tenant guard would
        // stamp it anyway, but it is a required field on the create input and the guard's
        // mismatch check verifies this value rather than trusting it.
        schoolId: actor.schoolId,
        createdById: actor.sub,
        fileName: file.originalname,
        status: TeacherImportBatchStatus.DRAFT,
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

  async getBatch(batchId: string): Promise<TeacherImportPreviewEntity> {
    const batch = await this.findBatchOrThrow(batchId);
    return this.toPreview(batch);
  }

  async buildErrorReport(batchId: string): Promise<string> {
    const batch = await this.findBatchOrThrow(batchId);
    return buildErrorReportCsv(this.readRowErrors(batch.invalidRows));
  }

  // Writes the valid rows. Invalid rows were filtered out before the transaction opens,
  // so a bad row can never abort the file — partial success is the required behaviour.
  async confirmBatch(
    batchId: string,
    actor: AuthenticatedUser,
    sendCredentialsEmail = false,
  ): Promise<TeacherImportResultEntity> {
    if (!actor.schoolId) {
      throw new ForbiddenException('A platform user cannot import teachers');
    }

    const batch = await this.findBatchOrThrow(batchId);
    if (batch.status === TeacherImportBatchStatus.COMMITTED) {
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

    let created: { id: string; email: string; name: string; password: string }[] = [];
    let finalErrors: TeacherImportRowError[] = knownErrors;

    try {
      ({ created, finalErrors } = await this.prisma.$transaction(
        async (tx) => {
          // The world may have moved since the preview: another admin could have created
          // one of these teachers, or a subject could have been retired. Re-validating
          // inside the transaction turns that into a skipped row instead of a failed file.
          const { rows, rowErrors } = await this.applyDatabaseValidation(
            tx,
            candidateRows,
            knownErrors,
          );

          const subjectsByCode = await this.resolveSubjects(tx, rows);
          const createdRows: typeof created = [];

          for (let index = 0; index < rows.length; index += CREATE_CHUNK_SIZE) {
            const chunk = rows.slice(index, index + CREATE_CHUNK_SIZE);
            const passwords = await Promise.all(
              chunk.map((row) => this.passwords.resolve(row.password, row.email)),
            );

            const users = await tx.user.createManyAndReturn({
              data: chunk.map((row, offset) => ({
                schoolId,
                email: row.email,
                name: row.name,
                role: Role.TEACHER,
                status: UserStatus.ACTIVE,
                activatedAt: new Date(),
                passwordHash: passwords[offset].passwordHash,
                plainPassword: passwords[offset].password,
              })),
              select: { id: true, email: true },
            });

            const byEmail = new Map(users.map((user) => [user.email, user.id]));

            // Assignments are written against TeacherAssignment directly and inside the
            // same transaction as their users: that is what makes a crash mid-import
            // incapable of leaving an assignment without its teacher.
            const assignments = chunk.flatMap((row) => {
              const userId = byEmail.get(row.email);
              if (!userId) {
                return [];
              }
              return row.subjectCodes.flatMap((code) => {
                const subject = subjectsByCode.get(code);
                return subject ? [{ schoolId, userId, subjectId: subject.id }] : [];
              });
            });

            if (assignments.length > 0) {
              await tx.teacherAssignment.createMany({ data: assignments, skipDuplicates: true });
            }

            chunk.forEach((row, offset) => {
              const id = byEmail.get(row.email);
              if (id) {
                createdRows.push({
                  id,
                  email: row.email,
                  name: row.name,
                  password: passwords[offset].password,
                });
              }
            });
          }

          await tx.teacherImportBatch.update({
            where: { id: batch.id },
            data: {
              status: TeacherImportBatchStatus.COMMITTED,
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
      // A P2002 here means someone created one of these emails between the in-transaction
      // re-check and the insert. An honest all-or-nothing failure beats a silent partial
      // write; the admin re-uploads and sees the current state.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(
          'The file changed while you were confirming. Re-upload it to see the current state.',
        );
      }
      throw error;
    }

    const { emailsSent, emailsFailed } = sendCredentialsEmail
      ? await this.dispatchCredentials(created, school)
      : { emailsSent: 0, emailsFailed: 0 };

    return {
      batchId: batch.id,
      createdCount: created.length,
      skippedCount: finalErrors.length,
      emailsSent,
      emailsFailed,
      invalidRows: finalErrors,
    };
  }

  // Invites go out only after the transaction commits, and a failure is counted rather
  // than thrown: the teacher already exists as PENDING and POST /users/:id/resend-invite
  // is the repair path. Rolling back a whole import over one bad mailbox would be worse.
  private async dispatchCredentials(
    created: { email: string; name: string; password: string }[],
    school: { name: string; slug: string },
  ): Promise<{ emailsSent: number; emailsFailed: number }> {
    let emailsSent = 0;
    let emailsFailed = 0;

    for (const teacher of created) {
      try {
        await this.mailService.sendCredentials({
          email: teacher.email,
          name: teacher.name,
          role: Role.TEACHER,
          schoolName: school.name,
          schoolSlug: school.slug,
          password: teacher.password,
        });
        emailsSent += 1;
      } catch (error) {
        emailsFailed += 1;
        this.logger.error(
          `Failed to send bulk-import credentials to ${teacher.email}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }

    return { emailsSent, emailsFailed };
  }

  // Shared by preview and confirm so both apply exactly the same rules — a row that
  // previewed as valid can only become invalid because the database changed, never
  // because the two paths disagree.
  private async applyDatabaseValidation(
    client: Pick<PrismaService, 'user' | 'subject'>,
    rows: ParsedTeacherRow[],
    existingErrors: TeacherImportRowError[],
  ): Promise<{ rows: ParsedTeacherRow[]; rowErrors: TeacherImportRowError[] }> {
    if (rows.length === 0) {
      return { rows: [], rowErrors: [...existingErrors] };
    }

    const takenEmails = await this.findTakenEmails(client, rows);
    const subjectsByCode = await this.resolveSubjects(client, rows);

    const valid: ParsedTeacherRow[] = [];
    const rowErrors = [...existingErrors];

    for (const row of rows) {
      const errors: TeacherImportRowIssue[] = [];

      if (takenEmails.has(row.email)) {
        errors.push({
          code: 'DUPLICATE_EXISTING',
          message: 'A user with this email already exists in this school.',
        });
      }

      const unknown: string[] = [];
      const retired: string[] = [];
      for (const code of row.subjectCodes) {
        const subject = subjectsByCode.get(code);
        if (!subject) {
          unknown.push(code);
        } else if (subject.status === SubjectStatus.RETIRED) {
          retired.push(code);
        }
      }

      // v1 never auto-creates subjects — an unrecognised code is a typo in the file,
      // not a request to extend the canonical platform list.
      if (unknown.length > 0) {
        errors.push({
          code: 'UNKNOWN_SUBJECT',
          message: `Subject code(s) not in the canonical subject list: ${unknown.join(', ')}.`,
        });
      }
      if (retired.length > 0) {
        errors.push({
          code: 'RETIRED_SUBJECT',
          message: `Subject code(s) no longer offered: ${retired.join(', ')}.`,
        });
      }

      if (errors.length > 0) {
        rowErrors.push({
          rowNumber: row.rowNumber,
          email: row.email,
          name: row.name,
          subjectCodes: row.rawSubjectCodes,
          errors,
        });
        continue;
      }

      valid.push(row);
    }

    rowErrors.sort((a, b) => a.rowNumber - b.rowNumber);

    return { rows: valid, rowErrors };
  }

  private async findTakenEmails(
    client: Pick<PrismaService, 'user'>,
    rows: ParsedTeacherRow[],
  ): Promise<Set<string>> {
    // Tenant-scoped automatically: this only ever sees the caller's own school, which is
    // also why a teacher of another school is not a duplicate here.
    const existing = await client.user.findMany({
      where: { email: { in: rows.map((row) => row.email) } },
      select: { email: true },
    });
    return new Set(existing.map((user) => user.email));
  }

  private async resolveSubjects(
    client: Pick<PrismaService, 'subject'>,
    rows: ParsedTeacherRow[],
  ): Promise<Map<string, ResolvedSubject>> {
    const codes = [...new Set(rows.flatMap((row) => row.subjectCodes))];
    if (codes.length === 0) {
      return new Map();
    }

    const subjects = await client.subject.findMany({
      where: { code: { in: codes } },
      select: { id: true, code: true, status: true },
    });

    return new Map(subjects.map((subject) => [subject.code, { id: subject.id, status: subject.status }]));
  }

  // Opportunistic, like LoginThrottleService's attempt pruning — a staging table does not
  // justify a scheduler, and the next upload is a natural moment to clear the last one.
  private async pruneStaleDrafts(): Promise<void> {
    await this.prisma.teacherImportBatch.deleteMany({
      where: {
        status: TeacherImportBatchStatus.DRAFT,
        createdAt: { lt: new Date(Date.now() - DRAFT_BATCH_TTL_MS) },
      },
    });
  }

  // Tenant-scoped, so another school's batch simply is not found — a 404 rather than a
  // 403, which would confirm the id exists.
  private async findBatchOrThrow(batchId: string): Promise<StoredBatch> {
    const batch = await this.prisma.teacherImportBatch.findUnique({
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

  private toPreview(batch: StoredBatch): TeacherImportPreviewEntity {
    return {
      batchId: batch.id,
      fileName: batch.fileName,
      status: batch.status,
      totalRows: batch.totalRows,
      validCount: batch.validCount,
      invalidCount: batch.invalidCount,
      validRows: this.readValidRows(batch.validRows).map(({ password, ...row }) => ({
        ...row,
        hasPassword: Boolean(password),
      })),
      invalidRows: this.readRowErrors(batch.invalidRows),
      warnings: (batch.warnings ?? []) as unknown as TeacherImportWarning[],
      createdAt: batch.createdAt,
    };
  }

  // Json columns come back as Prisma.JsonValue; this service is the only writer, so the
  // cast is narrowing our own serialisation rather than trusting external input.
  private readValidRows(value: Prisma.JsonValue): ParsedTeacherRow[] {
    return (value ?? []) as unknown as ParsedTeacherRow[];
  }

  private readRowErrors(value: Prisma.JsonValue): TeacherImportRowError[] {
    return (value ?? []) as unknown as TeacherImportRowError[];
  }
}
