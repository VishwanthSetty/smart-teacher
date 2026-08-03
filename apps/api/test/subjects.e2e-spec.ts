import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import request from 'supertest';
import { createE2eApp } from './utils/e2e-app';
import { loginAllRoles } from './utils/login';
import { seedContentFixtures } from './utils/content-fixtures';

interface Subject {
  id: string;
  name: string;
  code: string;
  status: 'ACTIVE' | 'RETIRED';
}

// Unique per run: there is no DELETE endpoint, so the subject this suite creates
// survives it. It is left RETIRED at the end, which keeps it out of GET /subjects and
// out of every other suite's fixtures.
const TEST_CODE = `e2e-subject-${Date.now()}`;

// The canonical subject taxonomy (F-37): SUPER_ADMIN owns it, every role reads it, and
// a subject in use cannot be retired. The fixtures entitle demo-school to
// (Grade 5, Mathematics) and give `maths` videos too, so `maths` is the fixture for
// "still referenced".
describe('Subjects (e2e)', () => {
  let app: INestApplication;
  let tokens: Record<Role, string>;
  let createdId: string;
  let mathsId: string;
  let grade5Id: string;
  let schoolBId: string;

  const asSuperAdmin = () => tokens[Role.SUPER_ADMIN];
  const get = (path: string, token: string) =>
    request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${token}`);
  const patchSubject = (id: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .patch(`/admin/subjects/${id}`)
      .set('Authorization', `Bearer ${asSuperAdmin()}`)
      .send(body);

  // Searched, not read off page 1: /admin/schools is paginated newest-first and other
  // suites create schools, so the seeded ones do not stay on the first page.
  async function findSchoolId(slug: string): Promise<string> {
    const res = await get(`/admin/schools?search=${slug}`, asSuperAdmin()).expect(200);
    const school = res.body.data.find((s: { slug: string }) => s.slug === slug);
    if (!school) {
      throw new Error(`School fixture "${slug}" is missing`);
    }
    return school.id;
  }

  beforeAll(async () => {
    await seedContentFixtures();
    app = await createE2eApp();
    tokens = await loginAllRoles(app);

    const [subjects, grades] = await Promise.all([
      get('/admin/subjects', asSuperAdmin()).expect(200),
      get('/admin/grade-levels', asSuperAdmin()).expect(200),
    ]);
    mathsId = subjects.body.find((s: Subject) => s.code === 'maths').id;
    grade5Id = grades.body.find((g: { name: string }) => g.name === 'Grade 5').id;
    schoolBId = await findSchoolId('demo-school-b');

    const created = await request(app.getHttpServer())
      .post('/admin/subjects')
      .set('Authorization', `Bearer ${asSuperAdmin()}`)
      .send({ name: 'E2E Subject', code: TEST_CODE })
      .expect(201);
    createdId = created.body.id;
    expect(created.body.status).toBe('ACTIVE');
  });

  afterAll(async () => {
    await app.close();
  });

  // A 500 for SUPER_ADMIN here means GET /subjects grew a traversal into the
  // `entitlements` relation — that model is tenant-scoped and SUPER_ADMIN has no
  // schoolId. For a tenant role it would instead have silently narrowed the canonical
  // list to that school's grants, which this test cannot see; keep the read path free
  // of relations.
  it.each(Object.values(Role))('lets a %s read the canonical subject list', async (role) => {
    const res = await get('/subjects', tokens[role]).expect(200);

    expect(res.body.map((s: Subject) => s.code)).toEqual(
      expect.arrayContaining(['maths', 'science']),
    );
  });

  it('401s an unauthenticated caller', async () => {
    await request(app.getHttpServer()).get('/subjects').expect(401);
  });

  it('rejects a duplicate code with a conflict', async () => {
    await request(app.getHttpServer())
      .post('/admin/subjects')
      .set('Authorization', `Bearer ${asSuperAdmin()}`)
      .send({ name: 'Another name, same code', code: TEST_CODE })
      .expect(409);
  });

  it('refuses to retire a subject the platform library and school grants still use', async () => {
    await patchSubject(mathsId, { status: 'RETIRED' }).expect(409);

    const res = await get('/subjects', tokens[Role.SCHOOL_ADMIN]).expect(200);
    expect(res.body.map((s: Subject) => s.code)).toContain('maths');
  });

  it('404s a PATCH against a subject that does not exist', async () => {
    await patchSubject('missing-00000000000000000000000', { name: 'X' }).expect(404);
  });

  it('renames a subject', async () => {
    const res = await patchSubject(createdId, { name: 'E2E Subject Renamed' }).expect(200);

    expect(res.body).toMatchObject({ name: 'E2E Subject Renamed', code: TEST_CODE });
  });

  // Ordered after the reads above: everything below runs against a retired subject.
  describe('once retired', () => {
    beforeAll(async () => {
      await patchSubject(createdId, { status: 'RETIRED' }).expect(200);
    });

    it('drops it from the canonical list but keeps it on the admin surface', async () => {
      const canonical = await get('/subjects', asSuperAdmin()).expect(200);
      expect(canonical.body.map((s: Subject) => s.code)).not.toContain(TEST_CODE);

      const admin = await get('/admin/subjects', asSuperAdmin()).expect(200);
      expect(admin.body.find((s: Subject) => s.code === TEST_CODE)).toMatchObject({
        status: 'RETIRED',
      });
    });

    it('409s a video that names it', async () => {
      await request(app.getHttpServer())
        .post('/admin/videos')
        .set('Authorization', `Bearer ${asSuperAdmin()}`)
        .send({
          title: 'Should not be created',
          gradeLevelId: grade5Id,
          subjectId: createdId,
          contentType: 'video/mp4',
          sizeBytes: 1024,
        })
        .expect(409);
    });

    // The grant never succeeds, so the seed's deliberate "school B holds nothing"
    // asymmetry is untouched by this test.
    it('409s an entitlement grant that names it', async () => {
      await request(app.getHttpServer())
        .post(`/admin/schools/${schoolBId}/entitlements`)
        .set('Authorization', `Bearer ${asSuperAdmin()}`)
        .send({ gradeLevelId: grade5Id, subjectId: createdId })
        .expect(409);
    });

    it('can be reactivated, which returns it to the canonical list', async () => {
      await patchSubject(createdId, { status: 'ACTIVE' }).expect(200);

      const res = await get('/subjects', asSuperAdmin()).expect(200);
      expect(res.body.map((s: Subject) => s.code)).toContain(TEST_CODE);

      // Leave it retired so it cannot pollute another suite's fixtures.
      await patchSubject(createdId, { status: 'RETIRED' }).expect(200);
    });
  });
});
