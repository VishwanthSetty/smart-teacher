import { join } from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import request from 'supertest';
import { MailService } from '../src/mail/mail.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantContextService } from '../src/tenancy/tenant-context.service';
import { createE2eApp } from './utils/e2e-app';
import { login, SEED_ACCOUNTS, SEED_PASSWORD } from './utils/login';
import { seedContentFixtures } from './utils/content-fixtures';

const FIXTURES = join(__dirname, 'fixtures', 'students');
const MISSING_BATCH_ID = 'missing-00000000000000000000000';

// A stub rather than a real SMTP transport: the import must be assertable without a mail
// server, and the invite dispatch is deliberately outside the import transaction.
const mailService = {
  sendUserInvite: jest.fn().mockResolvedValue(undefined),
  sendPasswordReset: jest.fn().mockResolvedValue(undefined),
  sendCredentials: jest.fn().mockResolvedValue(undefined),
};

describe('Student bulk import (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantContext: TenantContextService;
  let adminToken: string;
  let adminBToken: string;

  // The fixtures use fixed @example.com addresses, so the suite has to be idempotent:
  // a leftover student from the previous run would turn row 2 into DUPLICATE_EXISTING
  // and quietly invert what the first test asserts. Enrollments are removed before their
  // users — Enrollment.section is onDelete: Restrict, but the user FK is Cascade, so
  // deleting the user first would leave nothing to clean explicitly; deleting enrollments
  // first keeps the two operations independently correct regardless of FK order.
  async function removeImportedFixtures(): Promise<void> {
    await tenantContext.runWithSystemBypass(async () => {
      await prisma.studentImportBatch.deleteMany({ where: { fileName: { contains: '.csv' } } });
      await prisma.enrollment.deleteMany({ where: { user: { email: { endsWith: '@example.com' } } } });
      await prisma.user.deleteMany({ where: { email: { endsWith: '@example.com' } } });
    });
  }

  beforeAll(async () => {
    await seedContentFixtures();
    app = await createE2eApp({
      overrideProviders: (builder) => builder.overrideProvider(MailService).useValue(mailService),
    });
    prisma = app.get(PrismaService);
    tenantContext = app.get(TenantContextService);
    await removeImportedFixtures();
    adminToken = await login(
      app,
      SEED_ACCOUNTS[Role.SCHOOL_ADMIN].email,
      SEED_PASSWORD,
      SEED_ACCOUNTS[Role.SCHOOL_ADMIN].schoolSlug,
    );
    adminBToken = await login(app, 'admin-b@smartteacher.dev', SEED_PASSWORD, 'demo-school-b');
  });

  afterAll(async () => {
    await removeImportedFixtures();
    await app.close();
  });

  beforeEach(() => {
    mailService.sendCredentials.mockClear();
  });

  function upload(token: string, fixture: string) {
    return request(app.getHttpServer())
      .post('/students/bulk')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', join(FIXTURES, fixture));
  }

  function countStudents(token: string): Promise<number> {
    return request(app.getHttpServer())
      .get('/students')
      .query({ limit: 100 })
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .then((response) => response.body.meta.total);
  }

  it('serves a template whose headers the parser accepts', async () => {
    const response = await request(app.getHttpServer())
      .get('/students/bulk/template')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.text).toContain('first_name,last_name,email,grade_level,section,roll_number');
  });

  describe('preview', () => {
    it('reports each failure kind distinctly and writes nothing', async () => {
      const before = await countStudents(adminToken);

      const response = await upload(adminToken, 'mixed.csv').expect(201);

      // 7 rows: row 2 is good, row 3 is the *first* dupe@example.com (also good), row 4
      // repeats it, row 5 already exists (seeded student@), row 6 names a grade level
      // with no sections, row 7 names a section that does not exist under Grade 5, and
      // row 8 clashes with the seeded student's roll number (1) in Grade 5 - A.
      expect(response.body.totalRows).toBe(7);
      expect(response.body.validCount).toBe(2);
      expect(response.body.invalidCount).toBe(5);

      const codes = new Map<number, string[]>(
        response.body.invalidRows.map((row: { rowNumber: number; errors: { code: string }[] }) => [
          row.rowNumber,
          row.errors.map((issue) => issue.code),
        ]),
      );
      expect(codes.get(4)).toEqual(['DUPLICATE_IN_FILE']);
      expect(codes.get(5)).toEqual(['DUPLICATE_EXISTING']);
      expect(codes.get(6)).toEqual(['UNKNOWN_GRADE_LEVEL']);
      expect(codes.get(7)).toEqual(['UNKNOWN_SECTION']);
      expect(codes.get(8)).toEqual(['ROLL_NUMBER_TAKEN']);

      expect(await countStudents(adminToken)).toBe(before);
      expect(mailService.sendCredentials).not.toHaveBeenCalled();
    });

    it('rejects a file missing a required column, naming it', async () => {
      const response = await upload(adminToken, 'missing-email-column.csv').expect(400);

      expect(response.body.message).toContain('email');
    });

    it('rejects a file over the row limit and states both counts', async () => {
      const rows = Array.from(
        { length: 2001 },
        (_, index) => `Student,${index},bulk${index}@example.com,Grade 5,A,`,
      ).join('\n');

      const response = await request(app.getHttpServer())
        .post('/students/bulk')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach(
          'file',
          Buffer.from(`first_name,last_name,email,grade_level,section,roll_number\n${rows}\n`),
          'too-many.csv',
        )
        .expect(400);

      expect(response.body.message).toContain('2,001 rows');
      expect(response.body.message).toContain('2,000 rows');
    });

    it('413s a file over the 5 MB limit', async () => {
      const padding = 'x'.repeat(200);
      const rows = Array.from(
        { length: 30_000 },
        (_, index) => `Student,${padding},big${index}@example.com,Grade 5,A,`,
      ).join('\n');

      const response = await request(app.getHttpServer())
        .post('/students/bulk')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach(
          'file',
          Buffer.from(`first_name,last_name,email,grade_level,section,roll_number\n${rows}\n`),
          'huge.csv',
        )
        .expect(413);

      expect(response.body.message).toContain('5 MB');
    });

    it('400s when no file is attached', async () => {
      await request(app.getHttpServer())
        .post('/students/bulk')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
        .expect(400);
    });
  });

  describe('confirm', () => {
    it('imports the valid rows, skips the bad ones, and emails only the created students', async () => {
      const before = await countStudents(adminToken);
      const preview = await upload(adminToken, 'mixed.csv').expect(201);

      const result = await request(app.getHttpServer())
        .post(`/students/bulk/${preview.body.batchId}/confirm`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ sendCredentialsEmail: true })
        .expect(200);

      expect(result.body.createdCount).toBe(2);
      expect(result.body.skippedCount).toBe(5);
      expect(result.body.emailsSent).toBe(2);
      expect(result.body.emailsFailed).toBe(0);
      expect(await countStudents(adminToken)).toBe(before + 2);

      expect(mailService.sendCredentials).toHaveBeenCalledTimes(2);
      expect(mailService.sendCredentials).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'newstudent@example.com', role: Role.STUDENT }),
      );

      const students = await request(app.getHttpServer())
        .get('/students')
        .query({ limit: 100, search: 'newstudent@example.com' })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const created = students.body.data.find(
        (student: { email: string }) => student.email === 'newstudent@example.com',
      );
      expect(created).toMatchObject({ status: 'ACTIVE' });
      expect(created.enrollment).toMatchObject({ gradeLevelName: 'Grade 5', sectionName: 'A', rollNumber: '101' });
    });

    it('imports a BOM-prefixed, reordered-column file exported from Excel', async () => {
      const preview = await upload(adminToken, 'bom-reordered.csv').expect(201);

      // The trailing blank row must not count as data.
      expect(preview.body.totalRows).toBe(1);
      expect(preview.body.validCount).toBe(1);
      expect(preview.body.validRows[0].gradeLevel).toBe('Grade 5');

      const result = await request(app.getHttpServer())
        .post(`/students/bulk/${preview.body.batchId}/confirm`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(result.body.createdCount).toBe(1);
    });

    it('refuses a second confirm of the same batch', async () => {
      const preview = await upload(adminToken, 'mixed.csv').expect(201);
      const confirm = () =>
        request(app.getHttpServer())
          .post(`/students/bulk/${preview.body.batchId}/confirm`)
          .set('Authorization', `Bearer ${adminToken}`);

      await confirm().expect(200);
      await confirm().expect(409);
    });

    it('404s an unknown batch id', async () => {
      await request(app.getHttpServer())
        .post(`/students/bulk/${MISSING_BATCH_ID}/confirm`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });
  });

  describe('error report', () => {
    it('serves one CSV line per invalid row', async () => {
      const preview = await upload(adminToken, 'mixed.csv').expect(201);

      const response = await request(app.getHttpServer())
        .get(`/students/bulk/${preview.body.batchId}/errors`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.text).toContain(
        'row_number,first_name,last_name,email,grade_level,section,roll_number,password,errors',
      );
      expect(response.text).toContain('Duplicate of row 3 in this file.');
      expect(response.text).toContain('already exists in this school');
      expect(response.text).toContain('is not a grade level');
      expect(response.text).toContain('Create the section first');
      expect(response.text).toContain('already used in Grade 5 - A');
    });
  });

  // The acceptance criterion CLAUDE.md requires of every tenant feature: one tenant must
  // not be able to read or act on another's data, and a miss is a 404, never a 403.
  describe('tenant isolation', () => {
    it('hides another school’s batch from both read and confirm', async () => {
      const preview = await upload(adminToken, 'mixed.csv').expect(201);
      const batchId = preview.body.batchId;

      await request(app.getHttpServer())
        .get(`/students/bulk/${batchId}`)
        .set('Authorization', `Bearer ${adminBToken}`)
        .expect(404);

      await request(app.getHttpServer())
        .get(`/students/bulk/${batchId}/errors`)
        .set('Authorization', `Bearer ${adminBToken}`)
        .expect(404);

      await request(app.getHttpServer())
        .post(`/students/bulk/${batchId}/confirm`)
        .set('Authorization', `Bearer ${adminBToken}`)
        .expect(404);
    });

    it('does not treat another school’s student as a duplicate', async () => {
      // student@smartteacher.dev exists in demo-school but not demo-school-b, so the row
      // that is DUPLICATE_EXISTING for one admin is importable for the other.
      const response = await upload(adminBToken, 'mixed.csv').expect(201);

      const codes = new Map<number, string[]>(
        response.body.invalidRows.map((row: { rowNumber: number; errors: { code: string }[] }) => [
          row.rowNumber,
          row.errors.map((issue: { code: string }) => issue.code),
        ]),
      );
      expect(codes.get(5)).toBeUndefined();
      expect(
        response.body.validRows.map((row: { email: string }) => row.email),
      ).toContain('student@smartteacher.dev');
    });

    it('resolves grade levels and sections per tenant — Grade 6 has no sections in demo-school-b', async () => {
      const response = await request(app.getHttpServer())
        .post('/students/bulk')
        .set('Authorization', `Bearer ${adminBToken}`)
        .attach(
          'file',
          Buffer.from(
            'first_name,last_name,email,grade_level,section,roll_number\n' +
              'Grade6,Student,grade6student@example.com,Grade 6,A,1\n',
          ),
          'grade6-only.csv',
        )
        .expect(201);

      expect(response.body.invalidRows[0].errors[0].code).toBe('UNKNOWN_GRADE_LEVEL');
    });
  });
});
