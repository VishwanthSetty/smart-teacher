import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import request from 'supertest';
import { createE2eApp } from './utils/e2e-app';
import { loginAllRoles, login, SEED_PASSWORD } from './utils/login';
import { seedContentFixtures, SCIENCE_VIDEO_TITLE } from './utils/content-fixtures';

const MISSING_ID = 'missing-00000000000000000000000';

// Granting entitlements is SUPER_ADMIN's surface (F-06). These tests grant to
// demo-school-b, which the fixtures deliberately leave with none, then revoke — that
// asymmetry is the fixture other specs assert against, so it must be restored.
describe('Content entitlements (e2e)', () => {
  let app: INestApplication;
  let tokens: Record<Role, string>;
  let teacherB: string;
  let schoolBId: string;
  let g5ScienceCurriculumId: string;
  let draftCurriculumId: string;
  const granted: string[] = [];

  const asSuperAdmin = () => tokens[Role.SUPER_ADMIN];
  const entitlementsPath = (schoolId: string) => `/admin/schools/${schoolId}/entitlements`;

  async function grant(curriculumId: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post(entitlementsPath(schoolBId))
      .set('Authorization', `Bearer ${asSuperAdmin()}`)
      .send({ curriculumId })
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
      throw new Error(`School fixture "${slug}" is missing`);
    }
    return school.id;
  }

  beforeAll(async () => {
    const fixtures = await seedContentFixtures();
    g5ScienceCurriculumId = fixtures.g5ScienceCurriculumId;
    draftCurriculumId = fixtures.draftCurriculumId;

    app = await createE2eApp();
    tokens = await loginAllRoles(app);
    teacherB = await login(app, 'teacher-b@smartteacher.dev', SEED_PASSWORD, 'demo-school-b');

    schoolBId = await findSchoolId('demo-school-b');
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
  it("lets SUPER_ADMIN read a school's entitlements across the tenant boundary", async () => {
    const res = await request(app.getHttpServer())
      .get(entitlementsPath(schoolBId))
      .set('Authorization', `Bearer ${asSuperAdmin()}`)
      .expect(200);

    expect(res.body).toEqual([]);
  });

  it('returns entitlement coverage for every school to SUPER_ADMIN', async () => {
    const res = await request(app.getHttpServer())
      .get('/admin/entitlements/overview')
      .set('Authorization', `Bearer ${asSuperAdmin()}`)
      .expect(200);

    expect(res.body.schools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          schoolId: schoolBId,
          schoolSlug: 'demo-school-b',
          grantedCurricula: 0,
          studentCurricula: 0,
          teacherCurricula: 0,
          totalCurricula: expect.any(Number),
        }),
      ]),
    );
  });

  it('opens up content to a school the moment an entitlement is granted, and closes it on revoke', async () => {
    const before = await request(app.getHttpServer())
      .get('/videos')
      .set('Authorization', `Bearer ${teacherB}`)
      .expect(200);
    expect(before.body).toEqual([]);

    const id = await grant(g5ScienceCurriculumId);

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

  // Granting ahead of publication is allowed on purpose — the read path filters on
  // PUBLISHED, so an unpublished curriculum reaches nobody until an operator publishes
  // it. Requiring publish-before-grant would only be a sequencing trap.
  it('accepts a grant on an unpublished curriculum but serves none of its content', async () => {
    const id = await grant(draftCurriculumId);

    const curricula = await request(app.getHttpServer())
      .get('/curricula')
      .set('Authorization', `Bearer ${teacherB}`)
      .expect(200);
    expect(curricula.body).toEqual([]);

    await request(app.getHttpServer())
      .get(`/curricula/${draftCurriculumId}/tree`)
      .set('Authorization', `Bearer ${teacherB}`)
      .expect(404);

    await revoke(id);
    granted.splice(granted.indexOf(id), 1);
  });

  it('reports a repeat grant as a conflict rather than duplicating it', async () => {
    const id = await grant(g5ScienceCurriculumId);

    await request(app.getHttpServer())
      .post(entitlementsPath(schoolBId))
      .set('Authorization', `Bearer ${asSuperAdmin()}`)
      .send({ curriculumId: g5ScienceCurriculumId })
      .expect(409);

    await revoke(id);
    granted.splice(granted.indexOf(id), 1);
  });

  it.each([
    ['school', () => entitlementsPath(MISSING_ID), () => ({ curriculumId: g5ScienceCurriculumId })],
    ['curriculum', () => entitlementsPath(schoolBId), () => ({ curriculumId: MISSING_ID })],
  ])('404s rather than 500s when the %s does not exist', async (_label, path, body) => {
    await request(app.getHttpServer())
      .post(path())
      .set('Authorization', `Bearer ${asSuperAdmin()}`)
      .send(body())
      .expect(404);
  });

  it('404s revoking an entitlement id that belongs to a different school', async () => {
    const id = await grant(g5ScienceCurriculumId);

    // demo-school's own entitlement id, revoked via school B's path, must read as missing.
    const schoolAId = await findSchoolId('demo-school');

    const schoolAEntitlements = await request(app.getHttpServer())
      .get(entitlementsPath(schoolAId))
      .set('Authorization', `Bearer ${asSuperAdmin()}`)
      .expect(200);
    const before = schoolAEntitlements.body.length;

    await request(app.getHttpServer())
      .delete(`${entitlementsPath(schoolBId)}/${schoolAEntitlements.body[0].id}`)
      .set('Authorization', `Bearer ${asSuperAdmin()}`)
      .expect(404);

    // And school A still holds every one of them.
    const stillThere = await request(app.getHttpServer())
      .get(entitlementsPath(schoolAId))
      .set('Authorization', `Bearer ${asSuperAdmin()}`)
      .expect(200);
    expect(stillThere.body).toHaveLength(before);

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
        .send({ curriculumId: g5ScienceCurriculumId })
        .expect(403);

      await request(app.getHttpServer())
        .put(entitlementsPath(schoolBId))
        .set('Authorization', `Bearer ${tokens[role]}`)
        .send({ curriculumIds: [] })
        .expect(403);
    },
  );

  // The checkbox-matrix batch save — PUT replaces the school's whole entitlement set,
  // rather than one grant/revoke round-trip per curriculum.
  describe('PUT (batch replace)', () => {
    // Restore the fixture's deliberate asymmetry even if an assertion above fails
    // part-way — same reasoning as the outer afterAll's `granted` cleanup loop.
    afterEach(async () => {
      await request(app.getHttpServer())
        .put(entitlementsPath(schoolBId))
        .set('Authorization', `Bearer ${asSuperAdmin()}`)
        .send({ curriculumIds: [] });
    });

    it('opens up content the moment the set is replaced, and closes it again on the next replace', async () => {
      const before = await request(app.getHttpServer())
        .get('/videos')
        .set('Authorization', `Bearer ${teacherB}`)
        .expect(200);
      expect(before.body).toEqual([]);

      const replaced = await request(app.getHttpServer())
        .put(entitlementsPath(schoolBId))
        .set('Authorization', `Bearer ${asSuperAdmin()}`)
        .send({ curriculumIds: [g5ScienceCurriculumId] })
        .expect(200);
      expect(replaced.body).toHaveLength(1);

      const after = await request(app.getHttpServer())
        .get('/videos')
        .set('Authorization', `Bearer ${teacherB}`)
        .expect(200);
      expect(after.body.map((v: { title: string }) => v.title)).toEqual([SCIENCE_VIDEO_TITLE]);

      const cleared = await request(app.getHttpServer())
        .put(entitlementsPath(schoolBId))
        .set('Authorization', `Bearer ${asSuperAdmin()}`)
        .send({ curriculumIds: [] })
        .expect(200);
      expect(cleared.body).toEqual([]);

      const revoked = await request(app.getHttpServer())
        .get('/videos')
        .set('Authorization', `Bearer ${teacherB}`)
        .expect(200);
      expect(revoked.body).toEqual([]);
    });

    it('is a no-op safe to call twice with the same desired set', async () => {
      const curriculumIds = [g5ScienceCurriculumId];

      await request(app.getHttpServer())
        .put(entitlementsPath(schoolBId))
        .set('Authorization', `Bearer ${asSuperAdmin()}`)
        .send({ curriculumIds })
        .expect(200);

      const second = await request(app.getHttpServer())
        .put(entitlementsPath(schoolBId))
        .set('Authorization', `Bearer ${asSuperAdmin()}`)
        .send({ curriculumIds })
        .expect(200);
      expect(second.body).toHaveLength(1);

      await request(app.getHttpServer())
        .put(entitlementsPath(schoolBId))
        .set('Authorization', `Bearer ${asSuperAdmin()}`)
        .send({ curriculumIds: [] })
        .expect(200);
    });

    it.each([
      ['school', () => entitlementsPath(MISSING_ID), () => ({ curriculumIds: [g5ScienceCurriculumId] })],
      ['curriculum', () => entitlementsPath(schoolBId), () => ({ curriculumIds: [MISSING_ID] })],
    ])('404s rather than 500s when the %s does not exist', async (_label, path, body) => {
      await request(app.getHttpServer())
        .put(path())
        .set('Authorization', `Bearer ${asSuperAdmin()}`)
        .send(body())
        .expect(404);
    });
  });
});
