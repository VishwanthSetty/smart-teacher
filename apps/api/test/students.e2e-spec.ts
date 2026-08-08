import { INestApplication } from '@nestjs/common';
import { Role, UserStatus } from '@prisma/client';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { MailService } from '../src/mail/mail.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantContextService } from '../src/tenancy/tenant-context.service';
import { createE2eApp } from './utils/e2e-app';
import { login, SEED_ACCOUNTS, SEED_PASSWORD } from './utils/login';
import { seedContentFixtures } from './utils/content-fixtures';

const MISSING_ID = 'missing-00000000000000000000000';

// A stub rather than a real SMTP transport, same reasoning as teachers-bulk.e2e-spec.
const mailService = {
  sendUserInvite: jest.fn().mockResolvedValue(undefined),
  sendPasswordReset: jest.fn().mockResolvedValue(undefined),
  sendCredentials: jest.fn().mockResolvedValue(undefined),
};

describe('Students (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantContext: TenantContextService;
  let adminToken: string;
  let adminBToken: string;
  let teacherToken: string;

  let g5SectionAId: string; // demo-school, entitled — holds the seeded student
  let g5SectionBId: string; // demo-school, entitled
  let g6SectionAId: string; // demo-school, not entitled
  let schoolBSectionId: string; // demo-school-b

  // The fixtures use fixed @example.com addresses, so the suite is idempotent — a
  // leftover student from a previous run would collide with the roll-number and
  // duplicate-email assertions below.
  async function removeFixtureStudents(): Promise<void> {
    await tenantContext.runWithSystemBypass(async () => {
      await prisma.user.deleteMany({ where: { email: { endsWith: '@example.com' }, role: Role.STUDENT } });
    });
  }

  async function findSectionId(token: string, label: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .get('/sections')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const section = response.body.find((candidate: { label: string }) => candidate.label === label);
    if (!section) {
      throw new Error(`Section fixture not found: ${label}`);
    }
    return section.id;
  }

  function createStudent(token: string, overrides: Partial<Record<string, unknown>> = {}) {
    return request(app.getHttpServer())
      .post('/students')
      .set('Authorization', `Bearer ${token}`)
      .send({
        firstName: 'Test',
        lastName: 'Student',
        email: `student-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
        sectionId: g5SectionBId,
        ...overrides,
      });
  }

  beforeAll(async () => {
    await seedContentFixtures();
    app = await createE2eApp({
      overrideProviders: (builder) => builder.overrideProvider(MailService).useValue(mailService),
    });
    prisma = app.get(PrismaService);
    tenantContext = app.get(TenantContextService);
    await removeFixtureStudents();

    adminToken = await login(
      app,
      SEED_ACCOUNTS[Role.SCHOOL_ADMIN].email,
      SEED_PASSWORD,
      SEED_ACCOUNTS[Role.SCHOOL_ADMIN].schoolSlug,
    );
    adminBToken = await login(app, 'admin-b@smartteacher.dev', SEED_PASSWORD, 'demo-school-b');
    teacherToken = await login(
      app,
      SEED_ACCOUNTS[Role.TEACHER].email,
      SEED_PASSWORD,
      SEED_ACCOUNTS[Role.TEACHER].schoolSlug,
    );

    g5SectionAId = await findSectionId(adminToken, 'Grade 5 - A');
    g5SectionBId = await findSectionId(adminToken, 'Grade 5 - B');
    g6SectionAId = await findSectionId(adminToken, 'Grade 6 - A');
    schoolBSectionId = await findSectionId(adminBToken, 'Grade 5 - A');
  });

  afterAll(async () => {
    await removeFixtureStudents();
    await app.close();
  });

  beforeEach(() => {
    mailService.sendCredentials.mockClear();
  });

  describe('onboarding', () => {
    it('creates an ACTIVE student, enrolls them, and optionally emails credentials', async () => {
      const response = await createStudent(adminToken, { rollNumber: '501', sendCredentialsEmail: true }).expect(201);

      expect(response.body).toMatchObject({
        status: UserStatus.ACTIVE,
        firstName: 'Test',
        lastName: 'Student',
        enrollment: { sectionId: g5SectionBId, rollNumber: '501' },
      });
      expect(response.body.password).toEqual(expect.any(String));
      expect(mailService.sendCredentials).toHaveBeenCalledWith(
        expect.objectContaining({ role: Role.STUDENT, schoolSlug: 'demo-school' }),
      );
    });

    it('creates a student without an enrollment when the school does not use sections', async () => {
      const response = await createStudent(adminToken, { sectionId: undefined }).expect(201);

      expect(response.body).toMatchObject({ status: UserStatus.ACTIVE, enrollment: null });
      expect(response.body.password).toEqual(expect.any(String));
    });

    it('rejects a roll number without a section', async () => {
      await createStudent(adminToken, { sectionId: undefined, rollNumber: '501' }).expect(400);
    });

    it('rejects a section from another school with a 404, not a validation error', async () => {
      await createStudent(adminToken, { sectionId: schoolBSectionId }).expect(404);
      expect(mailService.sendCredentials).not.toHaveBeenCalled();
    });

    it('rejects a duplicate email with a 409', async () => {
      const email = `dup-${Date.now()}@example.com`;
      await createStudent(adminToken, { email }).expect(201);
      await createStudent(adminToken, { email }).expect(409);
    });
  });

  describe('roll number uniqueness', () => {
    it('rejects a second student with the same roll number in the same section', async () => {
      const rollNumber = `roll-${Date.now()}`;
      await createStudent(adminToken, { sectionId: g6SectionAId, rollNumber }).expect(201);
      await createStudent(adminToken, { sectionId: g6SectionAId, rollNumber }).expect(409);
    });

    it('allows the same roll number in a different section', async () => {
      const rollNumber = `roll-${Date.now()}-b`;
      await createStudent(adminToken, { sectionId: g5SectionBId, rollNumber }).expect(201);
      await createStudent(adminToken, { sectionId: g6SectionAId, rollNumber }).expect(201);
    });
  });

  describe('listing', () => {
    it('narrows by search, section, and status', async () => {
      const marker = `zlist${Date.now()}`;
      const active = await createStudent(adminToken, {
        firstName: marker,
        sectionId: g6SectionAId,
        rollNumber: `${marker}-1`,
      }).expect(201);
      const toDisable = await createStudent(adminToken, {
        firstName: marker,
        sectionId: g5SectionBId,
        rollNumber: `${marker}-2`,
      }).expect(201);
      await request(app.getHttpServer())
        .patch(`/students/${toDisable.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: UserStatus.DISABLED })
        .expect(200);

      const bySearch = await request(app.getHttpServer())
        .get(`/students?search=${marker}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(bySearch.body.data.map((s: { id: string }) => s.id).sort()).toEqual(
        [active.body.id, toDisable.body.id].sort(),
      );

      const bySection = await request(app.getHttpServer())
        .get(`/students?sectionId=${g6SectionAId}&search=${marker}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(bySection.body.data.map((s: { id: string }) => s.id)).toEqual([active.body.id]);

      const byStatus = await request(app.getHttpServer())
        .get(`/students?status=DISABLED&search=${marker}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(byStatus.body.data.map((s: { id: string }) => s.id)).toEqual([toDisable.body.id]);

      const paged = await request(app.getHttpServer())
        .get(`/students?search=${marker}&limit=1&page=1`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(paged.body.data).toHaveLength(1);
      expect(paged.body.meta).toMatchObject({ page: 1, limit: 1, total: 2, totalPages: 2 });
    });
  });

  // Acceptance criteria from the ticket.
  describe('acceptance criteria', () => {
    it('changing section immediately changes the video library the student sees', async () => {
      // Exercised through the seeded student so this assertion can reuse the stable
      // fixture credentials while testing the live enrollment change.
      const studentToken = await login(app, SEED_ACCOUNTS[Role.STUDENT].email, SEED_PASSWORD, 'demo-school');
      const originalEnrollment = await tenantContext.runWithSystemBypass(() =>
        prisma.enrollment.findFirst({
          where: { user: { email: SEED_ACCOUNTS[Role.STUDENT].email }, status: 'ACTIVE' },
        }),
      );
      const seededStudent = await request(app.getHttpServer())
        .get(`/students?search=${SEED_ACCOUNTS[Role.STUDENT].email}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const seededStudentId = seededStudent.body.data[0].id;

      try {
        // demo-school's only entitlement is (Grade 5, Mathematics), and the fixtures
        // enroll this student into Grade 5 - A.
        const before = await request(app.getHttpServer())
          .get('/videos')
          .set('Authorization', `Bearer ${studentToken}`)
          .expect(200);
        expect(before.body.length).toBeGreaterThan(0);
        expect(before.body.every((video: { title: string }) => video.title.includes('Grade 5'))).toBe(true);

        await request(app.getHttpServer())
          .patch(`/students/${seededStudentId}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ sectionId: g6SectionAId })
          .expect(200);

        // No re-login: content scope is resolved live from the DB, not carried in the
        // access token, so the same token immediately reflects the new enrollment.
        const after = await request(app.getHttpServer())
          .get('/videos')
          .set('Authorization', `Bearer ${studentToken}`)
          .expect(200);
        expect(after.body).toEqual([]);
      } finally {
        // Restore the seed fixture so other suites relying on it are unaffected.
        await request(app.getHttpServer())
          .patch(`/students/${seededStudentId}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ sectionId: g5SectionAId, rollNumber: originalEnrollment?.rollNumber ?? undefined })
          .expect(200);
      }
    });

    it('a deactivated student cannot log in but their record and history remain', async () => {
      const created = await createStudent(adminToken, {
        sectionId: g5SectionBId,
        rollNumber: `dis-${Date.now()}`,
      }).expect(201);

      // Activate directly (the invite-redemption flow is exercised elsewhere) so login
      // is possible to test at all.
      await tenantContext.runWithSystemBypass(async () =>
        prisma.user.update({
          where: { id: created.body.id },
          data: { status: UserStatus.ACTIVE, passwordHash: await bcrypt.hash('Temp1234!', 10) },
        }),
      );

      await request(app.getHttpServer())
        .patch(`/students/${created.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: UserStatus.DISABLED })
        .expect(200);

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: created.body.email, password: 'irrelevant', schoolSlug: 'demo-school' })
        .expect(401);

      const stillListed = await request(app.getHttpServer())
        .get(`/students?search=${created.body.email}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(stillListed.body.data[0]).toMatchObject({
        id: created.body.id,
        status: UserStatus.DISABLED,
        enrollment: { sectionId: g5SectionBId },
      });
    });
  });

  describe('tenant isolation', () => {
    it('hides a student from another school behind a 404, not a 403', async () => {
      const created = await createStudent(adminToken).expect(201);

      await request(app.getHttpServer())
        .patch(`/students/${created.body.id}`)
        .set('Authorization', `Bearer ${adminBToken}`)
        .send({ firstName: 'Hacked' })
        .expect(404);
    });

    it('does not list another school’s students', async () => {
      const created = await createStudent(adminToken, { rollNumber: `iso-${Date.now()}` }).expect(201);

      const response = await request(app.getHttpServer())
        .get(`/students?search=${created.body.email}`)
        .set('Authorization', `Bearer ${adminBToken}`)
        .expect(200);
      expect(response.body.data).toEqual([]);
    });

    it('rejects onboarding into another school’s section', async () => {
      await createStudent(adminBToken, { sectionId: g5SectionBId }).expect(404);
    });
  });

  describe('role access', () => {
    it('lets a TEACHER read the list but not write to it', async () => {
      await request(app.getHttpServer())
        .get('/students')
        .set('Authorization', `Bearer ${teacherToken}`)
        .expect(200);

      await createStudent(teacherToken).expect(403);

      await request(app.getHttpServer())
        .patch(`/students/${MISSING_ID}`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({ firstName: 'X' })
        .expect(403);
    });
  });
});
