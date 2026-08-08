import { INestApplication } from '@nestjs/common';
import { Role, UserStatus } from '@prisma/client';
import request from 'supertest';
import { MailService } from '../src/mail/mail.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantContextService } from '../src/tenancy/tenant-context.service';
import { createE2eApp } from './utils/e2e-app';
import { login, SEED_ACCOUNTS, SEED_PASSWORD } from './utils/login';
import { seedContentFixtures } from './utils/content-fixtures';

// A stub rather than a real SMTP transport, same reasoning as students.e2e-spec.
const mailService = {
  sendUserInvite: jest.fn().mockResolvedValue(undefined),
  sendPasswordReset: jest.fn().mockResolvedValue(undefined),
  sendCredentials: jest.fn().mockResolvedValue(undefined),
};

describe('Teacher onboarding (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantContext: TenantContextService;
  let adminToken: string;
  let teacherToken: string;
  let mathsSubjectId: string;
  let scienceSubjectId: string;

  // Fixed @example.com addresses, so the suite is idempotent — a leftover teacher from a
  // previous run would collide with the duplicate-email assertion below.
  async function removeFixtureTeachers(): Promise<void> {
    await tenantContext.runWithSystemBypass(async () => {
      await prisma.user.deleteMany({ where: { email: { endsWith: '@example.com' }, role: Role.TEACHER } });
    });
  }

  function createTeacher(token: string, overrides: Partial<Record<string, unknown>> = {}) {
    return request(app.getHttpServer())
      .post('/teachers')
      .set('Authorization', `Bearer ${token}`)
      .send({
        firstName: 'Test',
        lastName: 'Teacher',
        email: `teacher-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
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
    await removeFixtureTeachers();

    adminToken = await login(
      app,
      SEED_ACCOUNTS[Role.SCHOOL_ADMIN].email,
      SEED_PASSWORD,
      SEED_ACCOUNTS[Role.SCHOOL_ADMIN].schoolSlug,
    );
    teacherToken = await login(
      app,
      SEED_ACCOUNTS[Role.TEACHER].email,
      SEED_PASSWORD,
      SEED_ACCOUNTS[Role.TEACHER].schoolSlug,
    );

    const subjects = await request(app.getHttpServer())
      .get('/subjects')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    mathsSubjectId = subjects.body.find((s: { code: string }) => s.code === 'maths').id;
    scienceSubjectId = subjects.body.find((s: { code: string }) => s.code === 'science').id;
  });

  afterAll(async () => {
    await removeFixtureTeachers();
    await app.close();
  });

  beforeEach(() => {
    mailService.sendCredentials.mockClear();
  });

  describe('onboarding', () => {
    it('creates an ACTIVE teacher with a password and optionally emails credentials', async () => {
      const response = await createTeacher(adminToken, { sendCredentialsEmail: true }).expect(201);

      expect(response.body).toMatchObject({
        status: UserStatus.ACTIVE,
        firstName: 'Test',
        lastName: 'Teacher',
        subjects: [],
      });
      expect(response.body.password).toEqual(expect.any(String));
      expect(mailService.sendCredentials).toHaveBeenCalledWith(
        expect.objectContaining({ role: Role.TEACHER, schoolSlug: 'demo-school' }),
      );
    });

    it('creates school-wide subject assignments when subjectIds are given', async () => {
      const response = await createTeacher(adminToken, { subjectIds: [mathsSubjectId, scienceSubjectId] }).expect(
        201,
      );

      expect(response.body.subjects.map((s: { id: string }) => s.id).sort()).toEqual(
        [mathsSubjectId, scienceSubjectId].sort(),
      );

      const assignments = await request(app.getHttpServer())
        .get(`/teacher-assignments?teacherId=${response.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(assignments.body).toHaveLength(2);
      expect(assignments.body.every((a: { sectionId: string | null }) => a.sectionId === null)).toBe(true);
    });

    it('rejects an unknown subject id with a 404', async () => {
      await createTeacher(adminToken, { subjectIds: ['missing-subject'] }).expect(404);
      expect(mailService.sendCredentials).not.toHaveBeenCalled();
    });

    it('rejects a duplicate email with a 409', async () => {
      const email = `dup-${Date.now()}@example.com`;
      await createTeacher(adminToken, { email }).expect(201);
      await createTeacher(adminToken, { email }).expect(409);
    });
  });

  describe('role access', () => {
    it('rejects a TEACHER onboarding another teacher', async () => {
      await createTeacher(teacherToken).expect(403);
    });
  });
});
