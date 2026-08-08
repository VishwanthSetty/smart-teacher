import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Role, SubjectStatus, TeacherImportBatchStatus, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { PasswordsService } from '../passwords/passwords.service';
import { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { TeacherImportService } from './teacher-import.service';

const ACTOR: AuthenticatedUser = {
  sub: 'admin-1',
  email: 'admin@demo.dev',
  name: 'Admin',
  role: Role.SCHOOL_ADMIN,
  schoolId: 'school-1',
};

function upload(...lines: string[]): Express.Multer.File {
  const buffer = Buffer.from(lines.join('\n'), 'utf8');
  return {
    originalname: 'teachers.csv',
    mimetype: 'text/csv',
    size: buffer.length,
    buffer,
  } as Express.Multer.File;
}

const HEADER = 'email,name,subject_codes';

describe('TeacherImportService', () => {
  let service: TeacherImportService;
  let prisma: {
    user: { findMany: jest.Mock; createManyAndReturn: jest.Mock };
    subject: { findMany: jest.Mock };
    school: { findUnique: jest.Mock };
    teacherAssignment: { createMany: jest.Mock };
    teacherImportBatch: {
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      deleteMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let mailService: { sendCredentials: jest.Mock };
  let passwordsService: { resolve: jest.Mock };

  beforeEach(async () => {
    prisma = {
      user: { findMany: jest.fn().mockResolvedValue([]), createManyAndReturn: jest.fn() },
      subject: { findMany: jest.fn().mockResolvedValue([]) },
      school: { findUnique: jest.fn().mockResolvedValue({ name: 'Demo', slug: 'demo' }) },
      teacherAssignment: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
      teacherImportBatch: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      // Interactive form only — the service never uses the array form.
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
    };

    mailService = { sendCredentials: jest.fn().mockResolvedValue(undefined) };
    passwordsService = { resolve: jest.fn().mockResolvedValue({ password: 'Teal-Fox-7412', passwordHash: 'hash' }) };

    // The batch row the service reads back is whatever it just wrote.
    prisma.teacherImportBatch.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({
        id: 'batch-1',
        fileName: data.fileName,
        status: data.status,
        totalRows: data.totalRows,
        validCount: data.validCount,
        invalidCount: data.invalidCount,
        validRows: data.validRows,
        invalidRows: data.invalidRows,
        warnings: data.warnings,
        createdAt: new Date('2026-07-27'),
      }),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TeacherImportService,
        { provide: PrismaService, useValue: prisma },
        { provide: MailService, useValue: mailService },
        { provide: PasswordsService, useValue: passwordsService },
      ],
    }).compile();

    service = module.get(TeacherImportService);
  });

  describe('createBatch', () => {
    it('never returns the password in the import preview', async () => {
      const preview = await service.createBatch(
        upload('email,name,subject_codes,password', 'asha@example.com,Asha Rao,,Teal-Fox-7412'),
        ACTOR,
      );
      expect(preview.validRows[0]).toMatchObject({ hasPassword: true });
      expect(preview.validRows[0]).not.toHaveProperty('password');
    });

    it('writes only a DRAFT batch — no teacher exists until the admin confirms', async () => {
      const preview = await service.createBatch(upload(HEADER, 'asha@example.com,Asha Rao,'), ACTOR);

      expect(prisma.user.createManyAndReturn).not.toHaveBeenCalled();
      expect(prisma.teacherAssignment.createMany).not.toHaveBeenCalled();
      expect(preview.status).toBe(TeacherImportBatchStatus.DRAFT);
      expect(preview.validCount).toBe(1);
    });

    it('distinguishes a duplicate inside the file from one against an existing record', async () => {
      prisma.user.findMany.mockResolvedValue([{ email: 'existing@example.com' }]);

      const preview = await service.createBatch(
        upload(
          HEADER,
          'asha@example.com,Asha Rao,',
          'asha@example.com,Asha Again,',
          'existing@example.com,Existing Teacher,',
        ),
        ACTOR,
      );

      const codesByRow = new Map(
        preview.invalidRows.map((row) => [row.rowNumber, row.errors.map((issue) => issue.code)]),
      );
      expect(codesByRow.get(3)).toEqual(['DUPLICATE_IN_FILE']);
      expect(codesByRow.get(4)).toEqual(['DUPLICATE_EXISTING']);
      expect(preview.validCount).toBe(1);
    });

    it('reports an unknown subject code and never creates the subject', async () => {
      const preview = await service.createBatch(upload(HEADER, 'asha@example.com,Asha Rao,art'), ACTOR);

      expect(preview.invalidRows[0].errors[0].code).toBe('UNKNOWN_SUBJECT');
      expect(preview.validCount).toBe(0);
    });

    it('reports a retired subject separately from an unknown one', async () => {
      prisma.subject.findMany.mockResolvedValue([
        { id: 'sub-1', code: 'latin', status: SubjectStatus.RETIRED },
      ]);

      const preview = await service.createBatch(upload(HEADER, 'asha@example.com,Asha Rao,latin'), ACTOR);

      expect(preview.invalidRows[0].errors[0].code).toBe('RETIRED_SUBJECT');
    });

    it('prunes stale draft batches on upload', async () => {
      await service.createBatch(upload(HEADER, 'asha@example.com,Asha Rao,'), ACTOR);

      expect(prisma.teacherImportBatch.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: TeacherImportBatchStatus.DRAFT }),
        }),
      );
    });
  });

  describe('confirmBatch', () => {
    function draftBatch(validRows: unknown[], invalidRows: unknown[] = []) {
      return {
        id: 'batch-1',
        fileName: 'teachers.csv',
        status: TeacherImportBatchStatus.DRAFT,
        totalRows: validRows.length + invalidRows.length,
        validCount: validRows.length,
        invalidCount: invalidRows.length,
        validRows,
        invalidRows,
        warnings: [],
        createdAt: new Date('2026-07-27'),
      };
    }

    const ROW = {
      rowNumber: 2,
      email: 'asha@example.com',
      name: 'Asha Rao',
      subjectCodes: ['maths'],
      rawSubjectCodes: 'maths',
    };

    beforeEach(() => {
      prisma.subject.findMany.mockResolvedValue([
        { id: 'sub-maths', code: 'maths', status: SubjectStatus.ACTIVE },
      ]);
      prisma.user.createManyAndReturn.mockResolvedValue([
        { id: 'user-1', email: 'asha@example.com' },
      ]);
    });

    it('creates the valid rows as ACTIVE teachers', async () => {
      prisma.teacherImportBatch.findUnique.mockResolvedValue(draftBatch([ROW]));

      const result = await service.confirmBatch('batch-1', ACTOR);

      expect(prisma.user.createManyAndReturn).toHaveBeenCalledWith(
        expect.objectContaining({
          data: [
            expect.objectContaining({
              email: 'asha@example.com',
              role: Role.TEACHER,
              status: UserStatus.ACTIVE,
              schoolId: 'school-1',
            }),
          ],
        }),
      );
      expect(result.createdCount).toBe(1);
    });

    it('writes assignments on the same transaction client as the users it links', async () => {
      prisma.teacherImportBatch.findUnique.mockResolvedValue(draftBatch([ROW]));

      await service.confirmBatch('batch-1', ACTOR);

      expect(prisma.teacherAssignment.createMany).toHaveBeenCalledWith({
        data: [{ schoolId: 'school-1', userId: 'user-1', subjectId: 'sub-maths' }],
        skipDuplicates: true,
      });
      // Both calls went through the single interactive transaction the service opened.
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('imports the good rows and skips the bad ones — one bad row never aborts the file', async () => {
      const badRow = {
        rowNumber: 3,
        email: 'broken@example.com',
        name: 'Broken',
        subjectCodes: [],
        errors: [{ code: 'MISSING_NAME', message: 'Name is required.' }],
      };
      prisma.teacherImportBatch.findUnique.mockResolvedValue(draftBatch([ROW], [badRow]));

      const result = await service.confirmBatch('batch-1', ACTOR);

      expect(result.createdCount).toBe(1);
      expect(result.skippedCount).toBe(1);
    });

    it('demotes a row whose email was taken between preview and confirm', async () => {
      prisma.teacherImportBatch.findUnique.mockResolvedValue(draftBatch([ROW]));
      prisma.user.findMany.mockResolvedValue([{ email: 'asha@example.com' }]);

      const result = await service.confirmBatch('batch-1', ACTOR);

      expect(result.createdCount).toBe(0);
      expect(result.invalidRows[0].errors[0].code).toBe('DUPLICATE_EXISTING');
      expect(prisma.user.createManyAndReturn).not.toHaveBeenCalled();
    });

    it('sends one credentials email per created teacher when requested', async () => {
      prisma.teacherImportBatch.findUnique.mockResolvedValue(draftBatch([ROW]));

      const result = await service.confirmBatch('batch-1', ACTOR, true);

      expect(mailService.sendCredentials).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'asha@example.com', role: Role.TEACHER, schoolName: 'Demo' }),
      );
      expect(result.emailsSent).toBe(1);
    });

    it('counts a failed invite without failing the import — the teacher still exists', async () => {
      prisma.teacherImportBatch.findUnique.mockResolvedValue(draftBatch([ROW]));
      mailService.sendCredentials.mockRejectedValue(new Error('smtp down'));

      const result = await service.confirmBatch('batch-1', ACTOR, true);

      expect(result.createdCount).toBe(1);
      expect(result.emailsFailed).toBe(1);
      expect(result.emailsSent).toBe(0);
    });

    it('rejects a second confirm of the same batch', async () => {
      prisma.teacherImportBatch.findUnique.mockResolvedValue({
        ...draftBatch([ROW]),
        status: TeacherImportBatchStatus.COMMITTED,
      });

      await expect(service.confirmBatch('batch-1', ACTOR)).rejects.toThrow(ConflictException);
      expect(prisma.user.createManyAndReturn).not.toHaveBeenCalled();
    });

    it('404s on a batch that is not found — another tenant is simply invisible', async () => {
      prisma.teacherImportBatch.findUnique.mockResolvedValue(null);

      await expect(service.confirmBatch('batch-1', ACTOR)).rejects.toThrow(NotFoundException);
    });
  });

  describe('buildErrorReport', () => {
    it('renders one CSV line per invalid row with its reasons', async () => {
      prisma.teacherImportBatch.findUnique.mockResolvedValue({
        id: 'batch-1',
        fileName: 'teachers.csv',
        status: TeacherImportBatchStatus.COMMITTED,
        totalRows: 1,
        validCount: 0,
        invalidCount: 1,
        validRows: [],
        invalidRows: [
          {
            rowNumber: 4,
            email: 'bad@example.com',
            name: 'Bad Row',
            subjectCodes: 'art',
            errors: [{ code: 'UNKNOWN_SUBJECT', message: 'Subject code(s) not in the list: art.' }],
          },
        ],
        warnings: [],
        createdAt: new Date('2026-07-27'),
      });

      const csv = await service.buildErrorReport('batch-1');

      expect(csv).toContain('row_number,email,name,subject_codes,password,errors');
      expect(csv).toContain('4,bad@example.com,Bad Row,art');
      expect(csv).toContain('Subject code(s) not in the list: art.');
    });
  });
});
