import { INestApplication } from '@nestjs/common';
import { Workbook } from 'exceljs';
import { Role } from '@prisma/client';
import request from 'supertest';
import { createE2eApp } from './utils/e2e-app';
import { seedContentFixtures, type ContentFixtures } from './utils/content-fixtures';
import { DEMO_SCHOOL_B_SLUG } from './utils/global-setup';
import { login, loginAllRoles, SEED_PASSWORD } from './utils/login';

interface ViewEntry {
  id: string;
  date: string;
  title: string;
  source: 'PLATFORM' | 'SCHOOL';
  subject: { id: string };
}

// Rows are never cleaned up between runs, so each run plans against a year of its own:
// every calendar unique key includes the year, and leftovers from a previous run can
// never collide with or leak into this one.
const RUN = Date.now().toString(36);

async function workbook(rows: unknown[][]): Promise<Buffer> {
  const book = new Workbook();
  const sheet = book.addWorksheet('Lessons');
  rows.forEach((row) => sheet.addRow(row));
  return Buffer.from(await book.xlsx.writeBuffer());
}

describe('Academic calendar (e2e)', () => {
  let app: INestApplication;
  let tokens: Record<Role, string>;
  let adminBToken: string;
  let teacherBToken: string;
  let fixtures: ContentFixtures;
  let yearId: string;
  let defaultCalendarId: string;
  let schoolCalendarId: string;

  const http = () => request(app.getHttpServer());
  const as = (token: string) => ({
    get: (path: string) => http().get(path).set('Authorization', `Bearer ${token}`),
    post: (path: string, body: object = {}) => http().post(path).set('Authorization', `Bearer ${token}`).send(body),
    put: (path: string, body: object) => http().put(path).set('Authorization', `Bearer ${token}`).send(body),
    delete: (path: string) => http().delete(path).set('Authorization', `Bearer ${token}`),
  });
  const view = async (token: string): Promise<{ isEnabled: boolean; entries: ViewEntry[] }> => {
    const res = await as(token).get(`/academic-calendar?academicYearId=${yearId}`).expect(200);
    return res.body;
  };

  beforeAll(async () => {
    fixtures = await seedContentFixtures();
    app = await createE2eApp();
    tokens = await loginAllRoles(app);
    adminBToken = await login(app, 'admin-b@smartteacher.dev', SEED_PASSWORD, DEMO_SCHOOL_B_SLUG);
    teacherBToken = await login(app, 'teacher-b@smartteacher.dev', SEED_PASSWORD, DEMO_SCHOOL_B_SLUG);

    const year = await as(tokens[Role.SUPER_ADMIN])
      .post('/admin/academic-years', { label: `e2e-${RUN}`, startDate: '2040-06-01', endDate: '2041-03-31' })
      .expect(201);
    yearId = year.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('platform default', () => {
    it('is created as a draft and rejects an entry outside the year', async () => {
      const res = await as(tokens[Role.SUPER_ADMIN])
        .post('/admin/academic-calendars', {
          academicYearId: yearId,
          gradeLevelId: fixtures.grade5Id,
          subjectId: fixtures.mathsId,
        })
        .expect(201);
      defaultCalendarId = res.body.id;
      expect(res.body.status).toBe('DRAFT');

      await as(tokens[Role.SUPER_ADMIN])
        .post(`/admin/academic-calendars/${defaultCalendarId}/entries`, { date: '2041-04-01', title: 'Too late' })
        .expect(422);
      await as(tokens[Role.SUPER_ADMIN])
        .post(`/admin/academic-calendars/${defaultCalendarId}/entries`, {
          date: '2040-06-03',
          title: 'Default: place value',
        })
        .expect(201);
    });

    it('rejects a second default for the same year, grade and subject', async () => {
      await as(tokens[Role.SUPER_ADMIN])
        .post('/admin/academic-calendars', {
          academicYearId: yearId,
          gradeLevelId: fixtures.grade5Id,
          subjectId: fixtures.mathsId,
        })
        .expect(409);
    });

    it('stays hidden from schools while it is a draft', async () => {
      expect((await view(tokens[Role.STUDENT])).entries).toEqual([]);
    });

    it('reaches an entitled school once published', async () => {
      await as(tokens[Role.SUPER_ADMIN]).post(`/admin/academic-calendars/${defaultCalendarId}/publish`).expect(200);

      const result = await view(tokens[Role.STUDENT]);
      expect(result.isEnabled).toBe(true);
      expect(result.entries.map((entry) => [entry.title, entry.source])).toEqual([
        ['Default: place value', 'PLATFORM'],
      ]);
    });

    it('never reaches a school without the entitlement', async () => {
      expect((await view(teacherBToken)).entries).toEqual([]);
      const pairs = await as(teacherBToken).get('/academic-calendar/subjects').expect(200);
      expect(pairs.body).toEqual([]);
    });
  });

  describe("a school's own calendar", () => {
    it('cannot be created for a pair the school is not entitled to', async () => {
      await as(adminBToken)
        .post('/school-academic-calendars', {
          academicYearId: yearId,
          gradeLevelId: fixtures.grade5Id,
          subjectId: fixtures.mathsId,
        })
        .expect(404);
    });

    it('starts as a draft copy of the default, which keeps the default in force', async () => {
      const res = await as(tokens[Role.SCHOOL_ADMIN])
        .post('/school-academic-calendars', {
          academicYearId: yearId,
          gradeLevelId: fixtures.grade5Id,
          subjectId: fixtures.mathsId,
          copyFromDefault: true,
        })
        .expect(201);
      schoolCalendarId = res.body.id;
      expect(res.body.entries.map((entry: { title: string }) => entry.title)).toEqual(['Default: place value']);

      const overview = await as(tokens[Role.SCHOOL_ADMIN])
        .get(`/school-academic-calendars?academicYearId=${yearId}`)
        .expect(200);
      const row = overview.body.rows.find(
        (candidate: { subject: { id: string } }) => candidate.subject.id === fixtures.mathsId,
      );
      expect(row).toMatchObject({ effectiveSource: 'PLATFORM', schoolCalendar: { status: 'DRAFT', entryCount: 1 } });
      expect((await view(tokens[Role.STUDENT])).entries.map((entry) => entry.source)).toEqual(['PLATFORM']);
    });

    it('replaces the default for its pair once published', async () => {
      await as(tokens[Role.SCHOOL_ADMIN])
        .post(`/school-academic-calendars/${schoolCalendarId}/entries`, {
          date: '2040-06-04',
          title: 'School: number games',
        })
        .expect(201);
      await as(tokens[Role.SCHOOL_ADMIN]).post(`/school-academic-calendars/${schoolCalendarId}/publish`).expect(200);

      const result = await view(tokens[Role.STUDENT]);
      expect(result.entries.map((entry) => [entry.date, entry.title, entry.source])).toEqual([
        ['2040-06-03', 'Default: place value', 'SCHOOL'],
        ['2040-06-04', 'School: number games', 'SCHOOL'],
      ]);
    });

    it('cannot be read or edited by another school', async () => {
      await as(adminBToken).get(`/school-academic-calendars/${schoolCalendarId}`).expect(404);
      await as(adminBToken)
        .post(`/school-academic-calendars/${schoolCalendarId}/entries`, { date: '2040-06-05', title: 'Intruder' })
        .expect(404);
      await as(adminBToken).delete(`/school-academic-calendars/${schoolCalendarId}`).expect(404);
    });

    it('does not change what the default shows other schools', async () => {
      const res = await as(tokens[Role.SUPER_ADMIN]).get(`/admin/academic-calendars/${defaultCalendarId}`).expect(200);
      expect(res.body.entries.map((entry: { title: string }) => entry.title)).toEqual(['Default: place value']);
    });
  });

  describe('Excel upload', () => {
    const upload = (token: string, path: string, file: Buffer, fields: Record<string, string> = {}) => {
      const req = http().post(path).set('Authorization', `Bearer ${token}`).attach('file', file, 'plan.xlsx');
      Object.entries(fields).forEach(([key, value]) => req.field(key, value));
      return req;
    };

    it('serves a template that uploads cleanly', async () => {
      const template = await as(tokens[Role.SCHOOL_ADMIN])
        .get(`/school-academic-calendars/${schoolCalendarId}/entries/import-template`)
        .buffer(true)
        .parse((res, done) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => done(null, Buffer.concat(chunks)));
        })
        .expect(200);
      expect(template.headers['content-type']).toContain('spreadsheetml');

      const preview = await upload(
        tokens[Role.SCHOOL_ADMIN],
        `/school-academic-calendars/${schoolCalendarId}/entries/import`,
        template.body as Buffer,
        { dryRun: 'true' },
      ).expect(200);
      expect(preview.body).toMatchObject({ isCommitted: false, errors: [], rows: [{ date: '2040-06-01' }] });
    });

    it('previews without writing, then refuses to commit a file with a bad row', async () => {
      const file = await workbook([
        ['Date', 'Lesson'],
        ['05/06/2040', 'Upload: shapes'],
        ['2042-01-01', 'Out of year'],
      ]);
      const path = `/school-academic-calendars/${schoolCalendarId}/entries/import`;

      const preview = await upload(tokens[Role.SCHOOL_ADMIN], path, file, { dryRun: 'true' }).expect(200);
      expect(preview.body.rows).toHaveLength(1);
      expect(preview.body.errors).toEqual([expect.objectContaining({ rowNumber: 3 })]);

      await upload(tokens[Role.SCHOOL_ADMIN], path, file).expect(422);
      expect((await view(tokens[Role.STUDENT])).entries.map((entry) => entry.title)).not.toContain('Upload: shapes');
    });

    it('appends valid rows and skips ones already in the calendar', async () => {
      const file = await workbook([
        ['Date', 'Lesson', 'Notes'],
        ['2040-06-04', 'School: number games', null],
        ['2040-06-05', 'Upload: shapes', 'Bring blocks'],
      ]);

      const res = await upload(
        tokens[Role.SCHOOL_ADMIN],
        `/school-academic-calendars/${schoolCalendarId}/entries/import`,
        file,
      ).expect(200);

      expect(res.body).toMatchObject({ isCommitted: true, createdCount: 1, duplicateCount: 1, deletedCount: 0 });
      expect((await view(tokens[Role.STUDENT])).entries.map((entry) => entry.title)).toEqual([
        'Default: place value',
        'School: number games',
        'Upload: shapes',
      ]);
    });

    it("cannot import into another school's calendar", async () => {
      const file = await workbook([['Date', 'Lesson'], ['2040-06-06', 'Intruder']]);
      await upload(adminBToken, `/school-academic-calendars/${schoolCalendarId}/entries/import`, file).expect(404);
    });

    it("replaces a default calendar's entries when asked", async () => {
      const file = await workbook([['Date', 'Lesson'], ['2040-06-10', 'Default: revised plan']]);

      const res = await upload(
        tokens[Role.SUPER_ADMIN],
        `/admin/academic-calendars/${defaultCalendarId}/entries/import`,
        file,
        { replaceExisting: 'true' },
      ).expect(200);

      expect(res.body).toMatchObject({ isCommitted: true, createdCount: 1, deletedCount: 1 });
      const detail = await as(tokens[Role.SUPER_ADMIN]).get(`/admin/academic-calendars/${defaultCalendarId}`).expect(200);
      expect(detail.body.entries.map((entry: { title: string }) => entry.title)).toEqual(['Default: revised plan']);
    });
  });

  describe('opting out', () => {
    it('shows an empty calendar for that year and restores it when re-enabled', async () => {
      await as(tokens[Role.SCHOOL_ADMIN])
        .put(`/academic-calendar-settings/${yearId}`, { isEnabled: false })
        .expect(200);

      expect(await view(tokens[Role.STUDENT])).toMatchObject({ isEnabled: false, entries: [] });
      expect(await view(tokens[Role.TEACHER])).toMatchObject({ isEnabled: false, entries: [] });

      const settings = await as(tokens[Role.SCHOOL_ADMIN]).get('/academic-calendar-settings').expect(200);
      expect(
        settings.body.find((setting: { academicYear: { id: string } }) => setting.academicYear.id === yearId),
      ).toMatchObject({ isEnabled: false });

      await as(tokens[Role.SCHOOL_ADMIN])
        .put(`/academic-calendar-settings/${yearId}`, { isEnabled: true })
        .expect(200);
      expect((await view(tokens[Role.STUDENT])).entries).toHaveLength(3);
    });

    it("does not affect another school's setting", async () => {
      await as(tokens[Role.SCHOOL_ADMIN])
        .put(`/academic-calendar-settings/${yearId}`, { isEnabled: false })
        .expect(200);

      const settings = await as(adminBToken).get('/academic-calendar-settings').expect(200);
      expect(
        settings.body.find((setting: { academicYear: { id: string } }) => setting.academicYear.id === yearId),
      ).toMatchObject({ isEnabled: true });

      await as(tokens[Role.SCHOOL_ADMIN])
        .put(`/academic-calendar-settings/${yearId}`, { isEnabled: true })
        .expect(200);
    });
  });

  describe('reverting and cleanup guards', () => {
    it('refuses to delete a year that calendars still use', async () => {
      await as(tokens[Role.SUPER_ADMIN]).delete(`/admin/academic-years/${yearId}`).expect(409);
    });

    it('refuses to narrow a year past existing entries', async () => {
      await http()
        .patch(`/admin/academic-years/${yearId}`)
        .set('Authorization', `Bearer ${tokens[Role.SUPER_ADMIN]}`)
        .send({ startDate: '2040-06-04' })
        .expect(409);
    });

    it('falls back to the default once the school deletes its calendar', async () => {
      await as(tokens[Role.SCHOOL_ADMIN]).delete(`/school-academic-calendars/${schoolCalendarId}`).expect(204);

      expect((await view(tokens[Role.STUDENT])).entries.map((entry) => [entry.title, entry.source])).toEqual([
        ['Default: revised plan', 'PLATFORM'],
      ]);
    });
  });
});
