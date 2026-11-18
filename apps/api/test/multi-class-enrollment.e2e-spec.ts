import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import request from 'supertest';
import { MailService } from '../src/mail/mail.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantContextService } from '../src/tenancy/tenant-context.service';
import { createE2eApp } from './utils/e2e-app';
import { login, SEED_ACCOUNTS, SEED_PASSWORD } from './utils/login';
import { ContentFixtures, ENTITLED_VIDEO_TITLE, seedContentFixtures } from './utils/content-fixtures';

const EMAIL_PREFIX = 'multiclass-';

const mailService = {
  sendUserInvite: jest.fn().mockResolvedValue(undefined),
  sendPasswordReset: jest.fn().mockResolvedValue(undefined),
  sendCredentials: jest.fn().mockResolvedValue(undefined),
};

interface EnrollmentBody {
  id: string;
  sectionId: string;
  isCurrent: boolean;
}

// demo-school holds exactly one student entitlement, (Grade 5, Maths), and nothing for
// Grade 6 — so a Grade 6 class must browse an empty library. That asymmetry is what lets
// these assertions tell "current class" apart from "every class" without granting more.
describe('Multi-class enrollment (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantContext: TenantContextService;
  let fixtures: ContentFixtures;
  let adminToken: string;
  let adminBToken: string;

  let studentId: string;
  let studentToken: string;
  let g5EnrollmentId: string;
  let g6EnrollmentId: string;

  const http = () => request(app.getHttpServer());

  async function removeFixtureStudents(): Promise<void> {
    await tenantContext.runWithSystemBypass(async () => {
      await prisma.user.deleteMany({
        where: { email: { startsWith: EMAIL_PREFIX }, role: Role.STUDENT },
      });
    });
  }

  async function libraryTitles(): Promise<string[]> {
    const res = await http().get('/videos').set('Authorization', `Bearer ${studentToken}`).expect(200);
    return res.body.map((video: { title: string }) => video.title);
  }

  beforeAll(async () => {
    fixtures = await seedContentFixtures();
    app = await createE2eApp({
      overrideProviders: (builder) => builder.overrideProvider(MailService).useValue(mailService),
    });
    prisma = app.get(PrismaService);
    tenantContext = app.get(TenantContextService);
    await removeFixtureStudents();

    adminToken = await login(app, SEED_ACCOUNTS[Role.SCHOOL_ADMIN].email, SEED_PASSWORD, 'demo-school');
    adminBToken = await login(app, 'admin-b@smartteacher.dev', SEED_PASSWORD, 'demo-school-b');

    const email = `${EMAIL_PREFIX}${Date.now()}@example.com`;
    const created = await http()
      .post('/students')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ firstName: 'Multi', lastName: 'Class', email, password: SEED_PASSWORD, sectionId: fixtures.g5SectionAId })
      .expect(201);
    studentId = created.body.id;
    g5EnrollmentId = created.body.enrollments[0].id;
    studentToken = await login(app, email, SEED_PASSWORD, 'demo-school');
  });

  afterAll(async () => {
    await removeFixtureStudents();
    await app.close();
  });

  it('adds a second class, in another grade, without moving the student out of the first', async () => {
    const res = await http()
      .post(`/students/${studentId}/enrollments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sectionId: fixtures.g6SectionAId, rollNumber: '7' })
      .expect(201);

    const enrollments: EnrollmentBody[] = res.body.enrollments;
    expect(enrollments.map((enrollment) => [enrollment.sectionId, enrollment.isCurrent])).toEqual([
      [fixtures.g5SectionAId, true],
      [fixtures.g6SectionAId, false],
    ]);
    expect(res.body.enrollment.sectionId).toBe(fixtures.g5SectionAId);
    g6EnrollmentId = enrollments[1].id;
  });

  it('refuses enrolling the student twice in the same section', async () => {
    await http()
      .post(`/students/${studentId}/enrollments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sectionId: fixtures.g6SectionAId })
      .expect(409);
  });

  it('lists every class on /users/me, current first', async () => {
    const res = await http().get('/users/me').set('Authorization', `Bearer ${studentToken}`).expect(200);

    expect(res.body.enrollment.id).toBe(g5EnrollmentId);
    expect(res.body.enrollments.map((enrollment: EnrollmentBody) => enrollment.id)).toEqual([
      g5EnrollmentId,
      g6EnrollmentId,
    ]);
  });

  it("browses the current class's grade and follows the student when they switch", async () => {
    expect(await libraryTitles()).toEqual([ENTITLED_VIDEO_TITLE]);

    const switched = await http()
      .put('/users/me/current-enrollment')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ enrollmentId: g6EnrollmentId })
      .expect(200);
    expect(switched.body.enrollment.id).toBe(g6EnrollmentId);

    expect(await libraryTitles()).toEqual([]);
  });

  // Authorization spans every class, so a link or notification into the other class's
  // content still opens while this one is selected.
  it("still opens another class's content directly while switched away from it", async () => {
    const adminList = await http().get('/videos').set('Authorization', `Bearer ${adminToken}`).expect(200);
    const video = adminList.body.find((candidate: { title: string }) => candidate.title === ENTITLED_VIDEO_TITLE);

    await http().get(`/videos/${video.id}`).set('Authorization', `Bearer ${studentToken}`).expect(200);
  });

  it('returns 404 when switching to an enrollment that is not the caller\'s own', async () => {
    const other = await tenantContext.runWithSystemBypass(() =>
      prisma.enrollment.findFirst({ where: { userId: { not: studentId } }, select: { id: true } }),
    );
    expect(other).not.toBeNull();

    await http()
      .put('/users/me/current-enrollment')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ enrollmentId: other?.id })
      .expect(404);
  });

  it("returns 404 when another school's admin touches this student's classes", async () => {
    await http()
      .post(`/students/${studentId}/enrollments`)
      .set('Authorization', `Bearer ${adminBToken}`)
      .send({ sectionId: fixtures.schoolBG5SectionAId })
      .expect(404);
    await http()
      .delete(`/students/${studentId}/enrollments/${g5EnrollmentId}`)
      .set('Authorization', `Bearer ${adminBToken}`)
      .expect(404);
  });

  it('updates the roll number in one class only', async () => {
    const res = await http()
      .patch(`/students/${studentId}/enrollments/${g5EnrollmentId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ rollNumber: '41' })
      .expect(200);

    const byId = new Map(res.body.enrollments.map((enrollment: EnrollmentBody & { rollNumber: string | null }) => [enrollment.id, enrollment.rollNumber]));
    expect(byId.get(g5EnrollmentId)).toBe('41');
    expect(byId.get(g6EnrollmentId)).toBe('7');
  });

  it('promotes the remaining class when the current one is removed', async () => {
    await http()
      .delete(`/students/${studentId}/enrollments/${g6EnrollmentId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(204);

    const me = await http().get('/users/me').set('Authorization', `Bearer ${studentToken}`).expect(200);
    expect(me.body.enrollments).toHaveLength(1);
    expect(me.body.enrollment).toEqual(expect.objectContaining({ id: g5EnrollmentId, isCurrent: true }));
    expect(await libraryTitles()).toEqual([ENTITLED_VIDEO_TITLE]);
  });

  it('returns 404 for an enrollment that has already ended', async () => {
    await http()
      .delete(`/students/${studentId}/enrollments/${g6EnrollmentId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
  });
});
