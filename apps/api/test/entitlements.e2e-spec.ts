import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import request from 'supertest';
import { createE2eApp } from './utils/e2e-app';
import { loginAllRoles, login, SEED_PASSWORD } from './utils/login';

const MISSING_ID = 'missing-00000000000000000000000';
const SCIENCE_VIDEO_TITLE = 'Grade 5 Science — The Water Cycle';

// Granting entitlements is SUPER_ADMIN's surface (F-06). These tests grant to
// demo-school-b, which the seed deliberately leaves with none, then revoke — the seed's
// asymmetry is the fixture other specs assert against, so it must be restored.
describe('Content entitlements (e2e)', () => {
  let app: INestApplication;
  let tokens: Record<Role, string>;
  let teacherB: string;
  let schoolBId: string;
  let grade5Id: string;
  let scienceId: string;
  const granted: string[] = [];

  const asSuperAdmin = () => tokens[Role.SUPER_ADMIN];
  const entitlementsPath = (schoolId: string) => `/admin/schools/${schoolId}/entitlements`;

  async function grant(gradeLevelId: string, subjectId: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post(entitlementsPath(schoolBId))
      .set('Authorization', `Bearer ${asSuperAdmin()}`)
      .send({ gradeLevelId, subjectId })
      .expect(201);

    granted.push(res.body.id);
    return res.body.id;
  }

  async function revoke(id: string): Promise<void> {
    await request(app.getHttpServer())
      .delete(`${entitlementsPath(schoolBId)}/${id}`)
      .set('Authorization', `Bearer ${asSuperAdmin()}`);
  }

  // Searched, not read off page 1: /admin/schools is paginated newest-first, and other
  // suites create schools, so the seeded ones do not stay on the first page.
  async function findSchoolId(slug: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .get(`/admin/schools?search=${slug}`)
      .set('Authorization', `Bearer ${asSuperAdmin()}`)
      .expect(200);

    const school = res.body.data.find((s: { slug: string }) => s.slug === slug);
    if (!school) {
      throw new Error(`Seed school "${slug}" is missing — run npm run db:seed`);
    }
    return school.id;
  }

  beforeAll(async () => {
    app = await createE2eApp();
    tokens = await loginAllRoles(app);
    teacherB = await login(app, 'teacher-b@smartteacher.dev', SEED_PASSWORD, 'demo-school-b');

    schoolBId = await findSchoolId('demo-school-b');

    const [grades, subjects] = await Promise.all([
      request(app.getHttpServer())
        .get('/admin/grade-levels')
        .set('Authorization', `Bearer ${asSuperAdmin()}`)
        .expect(200),
      request(app.getHttpServer())
        .get('/admin/subjects')
        .set('Authorization', `Bearer ${asSuperAdmin()}`)
        .expect(200),
    ]);
    grade5Id = grades.body.find((g: { name: string }) => g.name === 'Grade 5').id;
    scienceId = subjects.body.find((s: { code: string }) => s.code === 'science').id;
  });

  afterAll(async () => {
    // Restore the seed's asymmetry even if a test above failed part-way through.
    for (const id of granted) {
      await revoke(id);
    }
    await app.close();
  });

  // A 500 here would mean the controller's @BypassTenantScope is missing:
  // SchoolContentEntitlement is tenant-scoped and SUPER_ADMIN carries no schoolId.
  it('lets SUPER_ADMIN read a school\'s entitlements across the tenant boundary', async () => {
    const res = await request(app.getHttpServer())
      .get(entitlementsPath(schoolBId))
      .set('Authorization', `Bearer ${asSuperAdmin()}`)
      .expect(200);

    expect(res.body).toEqual([]);
  });

  it('opens up content to a school the moment an entitlement is granted, and closes it on revoke', async () => {
    const before = await request(app.getHttpServer())
      .get('/videos')
      .set('Authorization', `Bearer ${teacherB}`)
      .expect(200);
    expect(before.body).toEqual([]);

    const id = await grant(grade5Id, scienceId);

    const after = await request(app.getHttpServer())
      .get('/videos')
      .set('Authorization', `Bearer ${teacherB}`)
      .expect(200);
    expect(after.body.map((v: { title: string }) => v.title)).toEqual([SCIENCE_VIDEO_TITLE]);

    await revoke(id);
    granted.splice(granted.indexOf(id), 1);

    const revoked = await request(app.getHttpServer())
      .get('/videos')
      .set('Authorization', `Bearer ${teacherB}`)
      .expect(200);
    expect(revoked.body).toEqual([]);
  });

  it('reports a repeat grant as a conflict rather than duplicating it', async () => {
    const id = await grant(grade5Id, scienceId);

    await request(app.getHttpServer())
      .post(entitlementsPath(schoolBId))
      .set('Authorization', `Bearer ${asSuperAdmin()}`)
      .send({ gradeLevelId: grade5Id, subjectId: scienceId })
      .expect(409);

    await revoke(id);
    granted.splice(granted.indexOf(id), 1);
  });

  it.each([
    ['school', () => entitlementsPath(MISSING_ID), () => ({ gradeLevelId: grade5Id, subjectId: scienceId })],
    ['grade level', () => entitlementsPath(schoolBId), () => ({ gradeLevelId: MISSING_ID, subjectId: scienceId })],
    ['subject', () => entitlementsPath(schoolBId), () => ({ gradeLevelId: grade5Id, subjectId: MISSING_ID })],
  ])('404s rather than 500s when the %s does not exist', async (_label, path, body) => {
    await request(app.getHttpServer())
      .post(path())
      .set('Authorization', `Bearer ${asSuperAdmin()}`)
      .send(body())
      .expect(404);
  });

  it('404s revoking an entitlement id that belongs to a different school', async () => {
    const id = await grant(grade5Id, scienceId);

    // demo-school's own entitlement id, revoked via school B's path, must read as missing.
    const schoolAId = await findSchoolId('demo-school');

    const schoolAEntitlements = await request(app.getHttpServer())
      .get(entitlementsPath(schoolAId))
      .set('Authorization', `Bearer ${asSuperAdmin()}`)
      .expect(200);

    await request(app.getHttpServer())
      .delete(`${entitlementsPath(schoolBId)}/${schoolAEntitlements.body[0].id}`)
      .set('Authorization', `Bearer ${asSuperAdmin()}`)
      .expect(404);

    // And school A still holds it.
    const stillThere = await request(app.getHttpServer())
      .get(entitlementsPath(schoolAId))
      .set('Authorization', `Bearer ${asSuperAdmin()}`)
      .expect(200);
    expect(stillThere.body).toHaveLength(1);

    await revoke(id);
    granted.splice(granted.indexOf(id), 1);
  });

  // F-06 acceptance criterion: entitlement endpoints are Super Admin only.
  it.each([[Role.SCHOOL_ADMIN], [Role.TEACHER], [Role.STUDENT]])(
    '403s a %s on the entitlement grant surface',
    async (role) => {
      await request(app.getHttpServer())
        .get(entitlementsPath(schoolBId))
        .set('Authorization', `Bearer ${tokens[role]}`)
        .expect(403);

      await request(app.getHttpServer())
        .post(entitlementsPath(schoolBId))
        .set('Authorization', `Bearer ${tokens[role]}`)
        .send({ gradeLevelId: grade5Id, subjectId: scienceId })
        .expect(403);
    },
  );
});
