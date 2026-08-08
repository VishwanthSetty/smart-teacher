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

const FIXTURES = join(__dirname, 'fixtures', 'teachers');
const MISSING_BATCH_ID = 'missing-00000000000000000000000';

// A stub rather than a real SMTP transport: the import must be assertable without a mail
// server, and the invite dispatch is deliberately outside the import transaction.
const mailService = {
  sendUserInvite: jest.fn().mockResolvedValue(undefined),
  sendPasswordReset: jest.fn().mockResolvedValue(undefined),
  sendCredentials: jest.fn().mockResolvedValue(undefined),
};

describe('Teacher bulk import (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantContext: TenantContextService;
  let adminToken: string;
  let adminBToken: string;

  // The fixtures use fixed @example.com addresses, so the suite has to be idempotent:
  // a leftover teacher from the previous run would turn row 2 into DUPLICATE_EXISTING
  // and quietly invert what the first test asserts.
  async function removeImportedFixtures(): Promise<void> {
    await tenantContext.runWithSystemBypass(async () => {
      await prisma.teacherImportBatch.deleteMany({ where: { fileName: { contains: '.csv' } } });
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
      .post('/teachers/bulk')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', join(FIXTURES, fixture));
  }

  function countUsers(token: string): Promise<number> {
    return request(app.getHttpServer())
      .get('/admin/users')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .then((response) => response.body.length);
  }

  it('serves a template whose headers the parser accepts', async () => {
    const response = await request(app.getHttpServer())
      .get('/teachers/bulk/template')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.text).toContain('email,name,subject_codes');
  });

  describe('preview', () => {
    it('reports each failure kind distinctly and writes nothing', async () => {
      const before = await countUsers(adminToken);

      const response = await upload(adminToken, 'mixed.csv').expect(201);

      // 5 rows: rows 2 and 3 are good (row 3 is the *first* dupe@example.com, so it is
      // the one that imports), row 4 repeats it, row 5 already exists, row 6 names a
      // subject that does not.
      expect(response.body.totalRows).toBe(5);
      expect(response.body.validCount).toBe(2);
      expect(response.body.invalidCount).toBe(3);

      const codes = new Map<number, string[]>(
        response.body.invalidRows.map((row: { rowNumber: number; errors: { code: string }[] }) => [
          row.rowNumber,
          row.errors.map((issue) => issue.code),
        ]),
      );
      expect(codes.get(4)).toEqual(['DUPLICATE_IN_FILE']);
      expect(codes.get(5)).toEqual(['DUPLICATE_EXISTING']);
      expect(codes.get(6)).toEqual(['UNKNOWN_SUBJECT']);

      expect(await countUsers(adminToken)).toBe(before);
      expect(mailService.sendCredentials).not.toHaveBeenCalled();
    });

    it('rejects a file missing a required column, naming it', async () => {
      const response = await upload(adminToken, 'missing-name-column.csv').expect(400);

      expect(response.body.message).toContain('name');
    });

    it('rejects a file over the row limit and states both counts', async () => {
      const rows = Array.from(
        { length: 2001 },
        (_, index) => `bulk${index}@example.com,Teacher ${index},maths`,
      ).join('\n');

      const response = await request(app.getHttpServer())
        .post('/teachers/bulk')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', Buffer.from(`email,name,subject_codes\n${rows}\n`), 'too-many.csv')
        .expect(400);

      expect(response.body.message).toContain('2,001 rows');
      expect(response.body.message).toContain('2,000 rows');
    });

    it('413s a file over the 5 MB limit', async () => {
      const padding = 'x'.repeat(200);
      const rows = Array.from(
        { length: 30_000 },
        (_, index) => `big${index}@example.com,Teacher ${padding},maths`,
      ).join('\n');

      const response = await request(app.getHttpServer())
        .post('/teachers/bulk')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', Buffer.from(`email,name,subject_codes\n${rows}\n`), 'huge.csv')
        .expect(413);

      expect(response.body.message).toContain('5 MB');
    });

    it('400s when no file is attached', async () => {
      await request(app.getHttpServer())
        .post('/teachers/bulk')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
        .expect(400);
    });
  });

  describe('confirm', () => {
    it('imports the valid rows, skips the bad ones, and emails only the created teachers', async () => {
      const before = await countUsers(adminToken);
      const preview = await upload(adminToken, 'mixed.csv').expect(201);

      const result = await request(app.getHttpServer())
        .post(`/teachers/bulk/${preview.body.batchId}/confirm`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ sendCredentialsEmail: true })
        .expect(200);

      expect(result.body.createdCount).toBe(2);
      expect(result.body.skippedCount).toBe(3);
      expect(result.body.emailsSent).toBe(2);
      expect(result.body.emailsFailed).toBe(0);
      expect(await countUsers(adminToken)).toBe(before + 2);

      expect(mailService.sendCredentials).toHaveBeenCalledTimes(2);
      expect(mailService.sendCredentials).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'newteacher@example.com', role: Role.TEACHER }),
      );

      const users = await request(app.getHttpServer())
        .get('/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const created = users.body.find(
        (user: { email: string }) => user.email === 'newteacher@example.com',
      );
      expect(created).toMatchObject({ role: Role.TEACHER, status: 'ACTIVE' });
    });

    it('imports a BOM-prefixed, reordered-column file exported from Excel', async () => {
      const preview = await upload(adminToken, 'bom-reordered.csv').expect(201);

      // The trailing blank row must not count as data.
      expect(preview.body.totalRows).toBe(1);
      expect(preview.body.validCount).toBe(1);
      expect(preview.body.validRows[0].subjectCodes).toEqual(['maths', 'science']);

      const result = await request(app.getHttpServer())
        .post(`/teachers/bulk/${preview.body.batchId}/confirm`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(result.body.createdCount).toBe(1);
    });

    it('refuses a second confirm of the same batch', async () => {
      const preview = await upload(adminToken, 'mixed.csv').expect(201);
      const confirm = () =>
        request(app.getHttpServer())
          .post(`/teachers/bulk/${preview.body.batchId}/confirm`)
          .set('Authorization', `Bearer ${adminToken}`);

      await confirm().expect(200);
      await confirm().expect(409);
    });

    it('404s an unknown batch id', async () => {
      await request(app.getHttpServer())
        .post(`/teachers/bulk/${MISSING_BATCH_ID}/confirm`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });
  });

  describe('error report', () => {
    it('serves one CSV line per invalid row', async () => {
      const preview = await upload(adminToken, 'mixed.csv').expect(201);

      const response = await request(app.getHttpServer())
        .get(`/teachers/bulk/${preview.body.batchId}/errors`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.text).toContain('row_number,email,name,subject_codes,password,errors');
      expect(response.text).toContain('Duplicate of row 3 in this file.');
      expect(response.text).toContain('already exists in this school');
      expect(response.text).toContain('canonical subject list');
    });
  });

  // The acceptance criterion CLAUDE.md requires of every tenant feature: one tenant must
  // not be able to read or act on another's data, and a miss is a 404, never a 403.
  describe('tenant isolation', () => {
    it('hides another school’s batch from both read and confirm', async () => {
      const preview = await upload(adminToken, 'mixed.csv').expect(201);
      const batchId = preview.body.batchId;

      await request(app.getHttpServer())
        .get(`/teachers/bulk/${batchId}`)
        .set('Authorization', `Bearer ${adminBToken}`)
        .expect(404);

      await request(app.getHttpServer())
        .get(`/teachers/bulk/${batchId}/errors`)
        .set('Authorization', `Bearer ${adminBToken}`)
        .expect(404);

      await request(app.getHttpServer())
        .post(`/teachers/bulk/${batchId}/confirm`)
        .set('Authorization', `Bearer ${adminBToken}`)
        .expect(404);
    });

    it('does not treat another school’s teacher as a duplicate', async () => {
      // teacher@smartteacher.dev exists in demo-school but not demo-school-b, so the row
      // that is DUPLICATE_EXISTING for one admin is importable for the other.
      const response = await upload(adminBToken, 'mixed.csv').expect(201);

      const invalidRowFive = response.body.invalidRows.find(
        (row: { rowNumber: number }) => row.rowNumber === 5,
      );
      expect(invalidRowFive).toBeUndefined();
      expect(
        response.body.validRows.map((row: { email: string }) => row.email),
      ).toContain('teacher@smartteacher.dev');
    });
  });
});
