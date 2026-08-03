import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Role, StudentImportBatchStatus, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { InvitesService } from '../invites/invites.service';
import { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { EnrollmentsService } from './enrollments.service';
import { StudentImportService } from './student-import.service';

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
    originalname: 'students.csv',
    mimetype: 'text/csv',
    size: buffer.length,
    buffer,
  } as Express.Multer.File;
}

const HEADER = 'first_name,last_name,email,grade_level,section,roll_number';

const SECTION_G5A = { id: 'section-g5a', name: 'A', gradeLevel: { name: 'Grade 5' } };
const SECTION_G5B = { id: 'section-g5b', name: 'B', gradeLevel: { name: 'Grade 5' } };

describe('StudentImportService', () => {
  let service: StudentImportService;
  let prisma: {
    user: { findMany: jest.Mock; createManyAndReturn: jest.Mock };
    section: { findMany: jest.Mock };
    enrollment: { findMany: jest.Mock };
    school: { findUnique: jest.Mock };
    studentImportBatch: {
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      deleteMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let mailService: { sendUserInvite: jest.Mock; sendPasswordReset: jest.Mock };
  let invitesService: { mintToken: jest.Mock };
  let enrollments: { enrollMany: jest.Mock };

  beforeEach(async () => {
    prisma = {
      user: { findMany: jest.fn().mockResolvedValue([]), createManyAndReturn: jest.fn() },
      section: { findMany: jest.fn().mockResolvedValue([SECTION_G5A, SECTION_G5B]) },
      enrollment: { findMany: jest.fn().mockResolvedValue([]) },
      school: { findUnique: jest.fn().mockResolvedValue({ name: 'Demo', slug: 'demo' }) },
      studentImportBatch: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      // Interactive form only — the service never uses the array form.
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
    };

    mailService = { sendUserInvite: jest.fn().mockResolvedValue(undefined), sendPasswordReset: jest.fn() };

    let tokenSeq = 0;
    invitesService = {
      mintToken: jest.fn(() => {
        tokenSeq += 1;
        return {
          token: `token-${tokenSeq}`,
          tokenHash: `hash-${tokenSeq}`,
          expiresAt: new Date('2030-01-01'),
        };
      }),
    };

    enrollments = { enrollMany: jest.fn().mockResolvedValue(undefined) };

    // The batch row the service reads back is whatever it just wrote.
    prisma.studentImportBatch.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
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
        createdAt: new Date('2026-07-28'),
      }),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StudentImportService,
        { provide: PrismaService, useValue: prisma },
        { provide: MailService, useValue: mailService },
        { provide: InvitesService, useValue: invitesService },
        { provide: EnrollmentsService, useValue: enrollments },
      ],
    }).compile();

    service = module.get(StudentImportService);
  });

  describe('createBatch', () => {
    it('writes only a DRAFT batch — no student exists until the admin confirms', async () => {
      const preview = await service.createBatch(
        upload(HEADER, 'Asha,Rao,asha@example.com,Grade 5,A,12'),
        ACTOR,
      );

      expect(prisma.user.createManyAndReturn).not.toHaveBeenCalled();
      expect(enrollments.enrollMany).not.toHaveBeenCalled();
      expect(preview.status).toBe(StudentImportBatchStatus.DRAFT);
      expect(preview.validCount).toBe(1);
    });

    it('distinguishes a duplicate inside the file from one against an existing record', async () => {
      prisma.user.findMany.mockResolvedValue([{ email: 'existing@example.com' }]);

      const preview = await service.createBatch(
        upload(
          HEADER,
          'Asha,Rao,asha@example.com,Grade 5,A,12',
          'Asha,Rao,asha@example.com,Grade 5,A,13',
          'Existing,Student,existing@example.com,Grade 5,A,14',
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

    it('distinguishes an unknown grade level from an unknown section', async () => {
      const preview = await service.createBatch(
        upload(
          HEADER,
          'Asha,Rao,asha@example.com,Grade 9,A,1',
          'Ravi,Kumar,ravi@example.com,Grade 5,Z,2',
        ),
        ACTOR,
      );

      const codesByRow = new Map(
        preview.invalidRows.map((row) => [row.rowNumber, row.errors.map((issue) => issue.code)]),
      );
      expect(codesByRow.get(2)).toEqual(['UNKNOWN_GRADE_LEVEL']);
      expect(codesByRow.get(3)).toEqual(['UNKNOWN_SECTION']);
    });

    it('flags a roll number already active in that section', async () => {
      prisma.enrollment.findMany.mockResolvedValue([{ sectionId: SECTION_G5A.id, rollNumber: '12' }]);

      const preview = await service.createBatch(
        upload(HEADER, 'Asha,Rao,asha@example.com,Grade 5,A,12'),
        ACTOR,
      );

      expect(preview.invalidRows[0].errors[0].code).toBe('ROLL_NUMBER_TAKEN');
      expect(preview.validCount).toBe(0);
    });

    it('prunes stale draft batches on upload', async () => {
      await service.createBatch(upload(HEADER, 'Asha,Rao,asha@example.com,Grade 5,A,12'), ACTOR);

      expect(prisma.studentImportBatch.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: StudentImportBatchStatus.DRAFT }),
        }),
      );
    });
  });

  describe('confirmBatch', () => {
    function draftBatch(validRows: unknown[], invalidRows: unknown[] = []) {
      return {
        id: 'batch-1',
        fileName: 'students.csv',
        status: StudentImportBatchStatus.DRAFT,
        totalRows: validRows.length + invalidRows.length,
        validCount: validRows.length,
        invalidCount: invalidRows.length,
        validRows,
        invalidRows,
        warnings: [],
        createdAt: new Date('2026-07-28'),
      };
    }

    const ROW = {
      rowNumber: 2,
      firstName: 'Asha',
      lastName: 'Rao',
      email: 'asha@example.com',
      gradeLevel: 'Grade 5',
      section: 'A',
      rollNumber: '12',
    };

    beforeEach(() => {
      prisma.user.createManyAndReturn.mockResolvedValue([
        { id: 'user-1', email: 'asha@example.com' },
      ]);
    });

    it('creates the valid rows as PENDING students', async () => {
      prisma.studentImportBatch.findUnique.mockResolvedValue(draftBatch([ROW]));

      const result = await service.confirmBatch('batch-1', ACTOR);

      expect(prisma.user.createManyAndReturn).toHaveBeenCalledWith(
        expect.objectContaining({
          data: [
            expect.objectContaining({
              email: 'asha@example.com',
              name: 'Asha Rao',
              role: Role.STUDENT,
              status: UserStatus.PENDING,
              schoolId: 'school-1',
            }),
          ],
        }),
      );
      expect(result.createdCount).toBe(1);
    });

    it('enrolls the created students in their resolved section, in the same transaction', async () => {
      prisma.studentImportBatch.findUnique.mockResolvedValue(draftBatch([ROW]));

      await service.confirmBatch('batch-1', ACTOR);

      expect(enrollments.enrollMany).toHaveBeenCalledWith(prisma, [
        { schoolId: 'school-1', userId: 'user-1', sectionId: SECTION_G5A.id, rollNumber: '12' },
      ]);
      // Both calls went through the single interactive transaction the service opened.
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('imports the good rows and skips the bad ones — one bad row never aborts the file', async () => {
      const badRow = {
        rowNumber: 3,
        firstName: 'Broken',
        lastName: '',
        email: 'broken@example.com',
        gradeLevel: 'Grade 5',
        section: 'A',
        rollNumber: '',
        errors: [{ code: 'MISSING_LAST_NAME', message: 'Last name is required.' }],
      };
      prisma.studentImportBatch.findUnique.mockResolvedValue(draftBatch([ROW], [badRow]));

      const result = await service.confirmBatch('batch-1', ACTOR);

      expect(result.createdCount).toBe(1);
      expect(result.skippedCount).toBe(1);
    });

    it('demotes a row whose email was taken between preview and confirm', async () => {
      prisma.studentImportBatch.findUnique.mockResolvedValue(draftBatch([ROW]));
      prisma.user.findMany.mockResolvedValue([{ email: 'asha@example.com' }]);

      const result = await service.confirmBatch('batch-1', ACTOR);

      expect(result.createdCount).toBe(0);
      expect(result.invalidRows[0].errors[0].code).toBe('DUPLICATE_EXISTING');
      expect(prisma.user.createManyAndReturn).not.toHaveBeenCalled();
    });

    it('demotes a row whose roll number was claimed between preview and confirm', async () => {
      prisma.studentImportBatch.findUnique.mockResolvedValue(draftBatch([ROW]));
      prisma.enrollment.findMany.mockResolvedValue([{ sectionId: SECTION_G5A.id, rollNumber: '12' }]);

      const result = await service.confirmBatch('batch-1', ACTOR);

      expect(result.createdCount).toBe(0);
      expect(result.invalidRows[0].errors[0].code).toBe('ROLL_NUMBER_TAKEN');
    });

    it('sends one invite per created student', async () => {
      prisma.studentImportBatch.findUnique.mockResolvedValue(draftBatch([ROW]));

      const result = await service.confirmBatch('batch-1', ACTOR);

      expect(mailService.sendUserInvite).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'asha@example.com', role: Role.STUDENT, schoolName: 'Demo' }),
      );
      expect(result.invitesSent).toBe(1);
    });

    it('counts a failed invite without failing the import — the student still exists', async () => {
      prisma.studentImportBatch.findUnique.mockResolvedValue(draftBatch([ROW]));
      mailService.sendUserInvite.mockRejectedValue(new Error('smtp down'));

      const result = await service.confirmBatch('batch-1', ACTOR);

      expect(result.createdCount).toBe(1);
      expect(result.invitesFailed).toBe(1);
      expect(result.invitesSent).toBe(0);
    });

    it('rejects a second confirm of the same batch', async () => {
      prisma.studentImportBatch.findUnique.mockResolvedValue({
        ...draftBatch([ROW]),
        status: StudentImportBatchStatus.COMMITTED,
      });

      await expect(service.confirmBatch('batch-1', ACTOR)).rejects.toThrow(ConflictException);
      expect(prisma.user.createManyAndReturn).not.toHaveBeenCalled();
    });

    it('404s on a batch that is not found — another tenant is simply invisible', async () => {
      prisma.studentImportBatch.findUnique.mockResolvedValue(null);

      await expect(service.confirmBatch('batch-1', ACTOR)).rejects.toThrow(NotFoundException);
    });
  });

  describe('buildErrorReport', () => {
    it('renders one CSV line per invalid row with its reasons', async () => {
      prisma.studentImportBatch.findUnique.mockResolvedValue({
        id: 'batch-1',
        fileName: 'students.csv',
        status: StudentImportBatchStatus.COMMITTED,
        totalRows: 1,
        validCount: 0,
        invalidCount: 1,
        validRows: [],
        invalidRows: [
          {
            rowNumber: 4,
            firstName: 'Bad',
            lastName: 'Row',
            email: 'bad@example.com',
            gradeLevel: 'Grade 9',
            section: 'A',
            rollNumber: '1',
            errors: [{ code: 'UNKNOWN_GRADE_LEVEL', message: 'Grade 9 is not a grade level.' }],
          },
        ],
        warnings: [],
        createdAt: new Date('2026-07-28'),
      });

      const csv = await service.buildErrorReport('batch-1');

      expect(csv).toContain('row_number,first_name,last_name,email,grade_level,section,roll_number,errors');
      expect(csv).toContain('4,Bad,Row,bad@example.com,Grade 9,A,1');
      expect(csv).toContain('Grade 9 is not a grade level.');
    });
  });
});
