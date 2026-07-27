import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import request from 'supertest';
import { createE2eApp } from './utils/e2e-app';
import { loginAllRoles, login, SEED_PASSWORD } from './utils/login';

interface Video {
  id: string;
  title: string;
  gradeLevelId: string;
  subjectId: string;
}

// The seed entitles demo-school to exactly (Grade 5, Mathematics) and demo-school-b to
// nothing. Every assertion below leans on that asymmetry — granting more in the seed
// would make these pass vacuously.
const ENTITLED_TITLE = 'Grade 5 Maths — Fractions';
const UNENTITLED_TITLE = 'Grade 6 Maths — Ratios';

describe('Videos (e2e)', () => {
  let app: INestApplication;
  let tokens: Record<Role, string>;
  let teacherB: string;
  let library: Video[];

  const get = (path: string, token: string) =>
    request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${token}`);

  const idOf = (title: string): string => {
    const video = library.find((v) => v.title === title);
    if (!video) {
      throw new Error(`Seed video "${title}" is missing — run npm run db:seed`);
    }
    return video.id;
  };

  beforeAll(async () => {
    app = await createE2eApp();
    tokens = await loginAllRoles(app);
    teacherB = await login(app, 'teacher-b@smartteacher.dev', SEED_PASSWORD, 'demo-school-b');

    const res = await get('/admin/videos', tokens[Role.SUPER_ADMIN]).expect(200);
    library = res.body;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('the school-facing library', () => {
    it("lists only the videos covered by the school's entitlements", async () => {
      const res = await get('/videos', tokens[Role.TEACHER]).expect(200);

      expect(res.body.map((v: Video) => v.title)).toEqual([ENTITLED_TITLE]);
    });

    it('lets a teacher read an entitled video by id', async () => {
      const res = await get(`/videos/${idOf(ENTITLED_TITLE)}`, tokens[Role.TEACHER]).expect(200);

      expect(res.body.title).toBe(ENTITLED_TITLE);
    });

    // A 403 would confirm the video exists. An unentitled video must be indistinguishable
    // from one that was never created.
    it('returns 404, not 403, for a video the school holds no entitlement for', async () => {
      await get(`/videos/${idOf(UNENTITLED_TITLE)}`, tokens[Role.TEACHER]).expect(404);
    });

    it('gives a student the same entitled library as a teacher', async () => {
      const res = await get('/videos', tokens[Role.STUDENT]).expect(200);

      expect(res.body.map((v: Video) => v.title)).toEqual([ENTITLED_TITLE]);
    });

    it('shows a school with no entitlements an empty library, not the whole platform', async () => {
      const res = await get('/videos', teacherB).expect(200);

      expect(res.body).toEqual([]);
    });

    it("404s when an unentitled school asks for another school's entitled video by id", async () => {
      await get(`/videos/${idOf(ENTITLED_TITLE)}`, teacherB).expect(404);
    });

    // The single-read path and the list path resolve their scope through the same seam,
    // so a video absent from the list can never still be readable by id.
    it('never exposes by id a video that the list omitted', async () => {
      const listed = await get('/videos', tokens[Role.TEACHER]).expect(200);
      const listedIds: string[] = listed.body.map((v: Video) => v.id);

      for (const video of library.filter((v) => !listedIds.includes(v.id))) {
        await get(`/videos/${video.id}`, tokens[Role.TEACHER]).expect(404);
      }
    });
  });

  // F-06 acceptance criterion: "School Admins receive 403 on all video-content and
  // entitlement endpoints (those are Super Admin only)."
  describe('role boundaries', () => {
    it.each([
      ['/videos'],
      ['/admin/videos'],
      ['/admin/grade-levels'],
      ['/admin/subjects'],
    ])('403s a SCHOOL_ADMIN on %s', async (path) => {
      await get(path, tokens[Role.SCHOOL_ADMIN]).expect(403);
    });

    it.each([[Role.TEACHER], [Role.STUDENT]])('403s a %s on the admin video library', async (role) => {
      await get('/admin/videos', tokens[role]).expect(403);
    });

    it('403s a SUPER_ADMIN on the school-facing library, which is not their surface', async () => {
      await get('/videos', tokens[Role.SUPER_ADMIN]).expect(403);
    });
  });

  describe('library management', () => {
    it('shows SUPER_ADMIN the whole platform library, unfiltered by any entitlement', async () => {
      expect(library.length).toBeGreaterThanOrEqual(3);
      expect(library.map((v) => v.title)).toContain(UNENTITLED_TITLE);
    });

    // Otherwise Prisma's raw foreign-key violation would surface as a 500.
    it('404s rather than 500s when a new video names a nonexistent grade level', async () => {
      await request(app.getHttpServer())
        .post('/admin/videos')
        .set('Authorization', `Bearer ${tokens[Role.SUPER_ADMIN]}`)
        .send({
          title: 'Orphan',
          externalId: 'orphan-01',
          gradeLevelId: 'missing-00000000000000000000000',
          subjectId: library[0].subjectId,
        })
        .expect(404);
    });

    it('rejects an undeclared field rather than silently dropping it', async () => {
      await request(app.getHttpServer())
        .post('/admin/videos')
        .set('Authorization', `Bearer ${tokens[Role.SUPER_ADMIN]}`)
        .send({
          title: 'Sneaky',
          externalId: 'sneaky-01',
          gradeLevelId: library[0].gradeLevelId,
          subjectId: library[0].subjectId,
          schoolId: 'some-school',
        })
        .expect(400);
    });
  });
});
