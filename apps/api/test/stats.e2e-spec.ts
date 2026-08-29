import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import request from 'supertest';
import { createE2eApp } from './utils/e2e-app';
import { SEED_PASSWORD, login, loginAllRoles } from './utils/login';
import { seedContentFixtures } from './utils/content-fixtures';

describe('Dashboard stats (e2e)', () => {
  let app: INestApplication;
  let tokens: Record<Role, string>;

  beforeAll(async () => {
    await seedContentFixtures();
    app = await createE2eApp();
    tokens = await loginAllRoles(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns membership counts for a SCHOOL_ADMIN', async () => {
    const response = await request(app.getHttpServer())
      .get('/admin/stats')
      .set('Authorization', `Bearer ${tokens[Role.SCHOOL_ADMIN]}`)
      .expect(200);

    // Other suites create users in demo-school with Date.now() suffixes and never clean
    // up, so the absolute numbers drift between runs — only the shape is stable.
    expect(response.body).toEqual({
      students: expect.any(Number),
      teachers: expect.any(Number),
      pendingInvites: expect.any(Number),
      classes: expect.any(Number),
      latestTimetable: null,
    });
    expect(response.body.students).toBeGreaterThanOrEqual(1);
    expect(response.body.teachers).toBeGreaterThanOrEqual(1);
  });

  it('reports the tenant section count and leaves the unbuilt timetable null', async () => {
    const response = await request(app.getHttpServer())
      .get('/admin/stats')
      .set('Authorization', `Bearer ${tokens[Role.SCHOOL_ADMIN]}`)
      .expect(200);

    expect(response.body.classes).toBeGreaterThanOrEqual(1);
    expect(response.body.latestTimetable).toBeNull();
  });

  it.each([Role.TEACHER, Role.STUDENT, Role.SUPER_ADMIN])('denies %s', async (role) => {
    await request(app.getHttpServer())
      .get('/admin/stats')
      .set('Authorization', `Bearer ${tokens[role]}`)
      .expect(403);
  });

  it('401s without a token', async () => {
    await request(app.getHttpServer()).get('/admin/stats').expect(401);
  });

  it('counts only the caller\'s own tenant', async () => {
    const adminBToken = await login(app, 'admin-b@smartteacher.dev', SEED_PASSWORD, 'demo-school-b');

    const [demoSchool, demoSchoolB] = await Promise.all([
      request(app.getHttpServer())
        .get('/admin/stats')
        .set('Authorization', `Bearer ${tokens[Role.SCHOOL_ADMIN]}`)
        .expect(200),
      request(app.getHttpServer())
        .get('/admin/stats')
        .set('Authorization', `Bearer ${adminBToken}`)
        .expect(200),
    ]);

    // demo-school-b is seeded with exactly one SCHOOL_ADMIN and one TEACHER, and no
    // other suite adds to it — so its teacher count is exactly 1 and its student count
    // exactly 0. demo-school has both, and its numbers drift upward as other suites
    // create users. An exact count here is the isolation assertion: if the count queries
    // escaped their school, B would also be counting demo-school's members.
    expect(demoSchoolB.body.students).toBe(0);
    expect(demoSchoolB.body.teachers).toBe(1);
    expect(demoSchool.body.students).toBeGreaterThan(demoSchoolB.body.students);
  });

  it('returns platform totals only to a SUPER_ADMIN', async () => {
    const response = await request(app.getHttpServer())
      .get('/admin/platform-stats')
      .set('Authorization', `Bearer ${tokens[Role.SUPER_ADMIN]}`)
      .expect(200);

    expect(response.body).toEqual({
      schools: expect.any(Number),
      curricula: expect.any(Number),
      videos: expect.any(Number),
      documents: expect.any(Number),
      recentSchools: expect.any(Array),
      contentPipeline: {
        ready: expect.any(Number),
        processing: expect.any(Number),
        queued: expect.any(Number),
        failed: expect.any(Number),
      },
    });
  });
});
