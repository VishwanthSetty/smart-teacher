import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import request from 'supertest';
import { MailService } from '../src/mail/mail.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantContextService } from '../src/tenancy/tenant-context.service';
import { createE2eApp } from './utils/e2e-app';
import { login, SEED_ACCOUNTS, SEED_PASSWORD } from './utils/login';
import { seedContentFixtures } from './utils/content-fixtures';

const MISSING_ID = 'missing-00000000000000000000000';

// A stub rather than a real SMTP transport, same reasoning as students.e2e-spec.
const mailService = {
  sendUserInvite: jest.fn().mockResolvedValue(undefined),
  sendPasswordReset: jest.fn().mockResolvedValue(undefined),
};

describe('Teacher assignments (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantContext: TenantContextService;
  let adminToken: string;
  let adminBToken: string;
  let teacherToken: string;

  let mathsId: string;
  let scienceId: string;
  let grade5Id: string; // demo-school's grade levels are platform-global
  let grade6Id: string;
  let schoolBSectionId: string; // demo-school-b, for the cross-tenant rejection test
  const createdSectionIds: string[] = [];

  // Fixture teachers use fixed @example.com addresses, so the suite is idempotent.
  async function removeFixtureTeachers(): Promise<void> {
    await tenantContext.runWithSystemBypass(async () => {
      // Cascades away any TeacherAssignment referencing these users first, so the
      // fixture sections below have no remaining FK reference and can be deleted too.
      await prisma.user.deleteMany({ where: { email: { endsWith: '@example.com' }, role: Role.TEACHER } });
    });
  }

  async function removeCreatedSections(): Promise<void> {
    if (createdSectionIds.length === 0) {
      return;
    }
    await tenantContext.runWithSystemBypass(async () => {
      await prisma.section.deleteMany({ where: { id: { in: createdSectionIds } } });
    });
  }

  async function createTeacher(token: string, overrides: Partial<Record<string, unknown>> = {}) {
    const response = await request(app.getHttpServer())
      .post('/admin/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Fixture Teacher',
        email: `teacher-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
        role: Role.TEACHER,
        ...overrides,
      })
      .expect(201);
    return response.body.id as string;
  }

  // A fresh section per call rather than reusing a seeded one — the (sectionId,
  // subjectId) unique index means seeded sections would collide across test cases that
  // don't otherwise clean up their assignments between tests.
  async function createSection(token: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/sections')
      .set('Authorization', `Bearer ${token}`)
      .send({ gradeLevelId: grade5Id, name: `Z${Date.now()}${Math.random().toString(36).slice(2, 6)}` })
      .expect(201);
    createdSectionIds.push(response.body.id);
    return response.body.id as string;
  }

  async function findByLabel(
    token: string,
    path: string,
    predicate: (candidate: { id: string } & Record<string, unknown>) => boolean,
    description: string,
  ): Promise<string> {
    const response = await request(app.getHttpServer())
      .get(path)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const match = (response.body as ({ id: string } & Record<string, unknown>)[]).find(predicate);
    if (!match) {
      throw new Error(`Fixture not found: ${description}`);
    }
    return match.id;
  }

  function createAssignment(token: string, body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .post('/teacher-assignments')
      .set('Authorization', `Bearer ${token}`)
      .send(body);
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
    adminBToken = await login(app, 'admin-b@smartteacher.dev', SEED_PASSWORD, 'demo-school-b');
    teacherToken = await login(
      app,
      SEED_ACCOUNTS[Role.TEACHER].email,
      SEED_PASSWORD,
      SEED_ACCOUNTS[Role.TEACHER].schoolSlug,
    );

    mathsId = await findByLabel(adminToken, '/subjects', (s) => s.code === 'maths', 'maths');
    scienceId = await findByLabel(adminToken, '/subjects', (s) => s.code === 'science', 'science');
    grade5Id = await findByLabel(adminToken, '/grade-levels', (g) => g.name === 'Grade 5', 'Grade 5');
    grade6Id = await findByLabel(adminToken, '/grade-levels', (g) => g.name === 'Grade 6', 'Grade 6');
    schoolBSectionId = await findByLabel(
      adminBToken,
      '/sections',
      (s) => s.label === 'Grade 5 - A',
      'demo-school-b Grade 5 - A',
    );
  });

  afterAll(async () => {
    await removeFixtureTeachers();
    await removeCreatedSections();
    await app.close();
  });

  beforeEach(() => {
    mailService.sendUserInvite.mockClear();
  });

  describe('create', () => {
    it('assigns a teacher to a section and subject', async () => {
      const teacherId = await createTeacher(adminToken);
      const sectionId = await createSection(adminToken);

      const response = await createAssignment(adminToken, {
        teacherId,
        subjectId: mathsId,
        sectionId,
      }).expect(201);

      expect(response.body).toMatchObject({ teacherId, subjectId: mathsId, sectionId });
      expect(response.body.sectionLabel).toMatch(/^Grade 5 - /);
    });

    it('creates a school-wide grant when no section is given', async () => {
      const teacherId = await createTeacher(adminToken);

      const response = await createAssignment(adminToken, { teacherId, subjectId: mathsId }).expect(201);

      expect(response.body).toMatchObject({ sectionId: null, sectionLabel: null });
    });

    it('creates a grade-bearing assignment when no section is given', async () => {
      const teacherId = await createTeacher(adminToken);

      const response = await createAssignment(adminToken, {
        teacherId,
        subjectId: mathsId,
        gradeLevelId: grade5Id,
      }).expect(201);

      expect(response.body).toMatchObject({
        sectionId: null,
        gradeLevelId: grade5Id,
        gradeLevelName: 'Grade 5',
      });
    });

    it('rejects a grade level that does not match the section', async () => {
      const teacherId = await createTeacher(adminToken);
      const sectionId = await createSection(adminToken);

      await createAssignment(adminToken, {
        teacherId,
        subjectId: mathsId,
        sectionId,
        gradeLevelId: grade6Id,
      }).expect(400);
    });

    it('rejects a second teacher for the same section and subject with a 409 naming the incumbent', async () => {
      const firstTeacherId = await createTeacher(adminToken, { name: 'Priya Prior' });
      const secondTeacherId = await createTeacher(adminToken);
      const sectionId = await createSection(adminToken);
      await createAssignment(adminToken, {
        teacherId: firstTeacherId,
        subjectId: scienceId,
        sectionId,
      }).expect(201);

      const conflict = await createAssignment(adminToken, {
        teacherId: secondTeacherId,
        subjectId: scienceId,
        sectionId,
      }).expect(409);
      expect(conflict.body.message).toContain('Priya Prior');
    });

    it('allows the same teacher and subject in a different section', async () => {
      const teacherId = await createTeacher(adminToken);
      const sectionOneId = await createSection(adminToken);
      const sectionTwoId = await createSection(adminToken);

      await createAssignment(adminToken, { teacherId, subjectId: mathsId, sectionId: sectionOneId }).expect(
        201,
      );
      await createAssignment(adminToken, { teacherId, subjectId: mathsId, sectionId: sectionTwoId }).expect(
        201,
      );
    });

    it('rejects a section from another school with a 404', async () => {
      const teacherId = await createTeacher(adminToken);

      await createAssignment(adminToken, {
        teacherId,
        subjectId: mathsId,
        sectionId: schoolBSectionId,
      }).expect(404);
    });

    it('rejects an unknown teacher with a 404', async () => {
      await createAssignment(adminToken, { teacherId: MISSING_ID, subjectId: mathsId }).expect(404);
    });
  });

  describe('listing', () => {
    it('filters by teacherId', async () => {
      const teacherId = await createTeacher(adminToken);
      const otherTeacherId = await createTeacher(adminToken);
      const sectionId = await createSection(adminToken);
      const otherSectionId = await createSection(adminToken);
      await createAssignment(adminToken, { teacherId, subjectId: mathsId, sectionId }).expect(201);
      await createAssignment(adminToken, {
        teacherId: otherTeacherId,
        subjectId: mathsId,
        sectionId: otherSectionId,
      }).expect(201);

      const response = await request(app.getHttpServer())
        .get(`/teacher-assignments?teacherId=${teacherId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0]).toMatchObject({ teacherId, sectionId });
    });
  });

  describe('tenant isolation', () => {
    it('does not list another school’s assignments', async () => {
      const teacherId = await createTeacher(adminToken);
      const sectionId = await createSection(adminToken);
      await createAssignment(adminToken, { teacherId, subjectId: mathsId, sectionId }).expect(201);

      const response = await request(app.getHttpServer())
        .get(`/teacher-assignments?teacherId=${teacherId}`)
        .set('Authorization', `Bearer ${adminBToken}`)
        .expect(200);
      expect(response.body).toEqual([]);
    });

    it('rejects assigning across a demo-school-b teacher id with a 404', async () => {
      // teacher-b@smartteacher.dev belongs to demo-school-b; from demo-school's admin
      // token this must 404 like any other cross-tenant id, never leak via a 403.
      const teacherBList = await request(app.getHttpServer())
        .get('/admin/users')
        .set('Authorization', `Bearer ${adminBToken}`)
        .expect(200);
      const teacherB = teacherBList.body.find((u: { email: string }) => u.email === 'teacher-b@smartteacher.dev');

      await createAssignment(adminToken, { teacherId: teacherB.id, subjectId: mathsId }).expect(404);
    });
  });

  describe('delete', () => {
    it('removes an assignment', async () => {
      const teacherId = await createTeacher(adminToken);
      const sectionId = await createSection(adminToken);
      const created = await createAssignment(adminToken, {
        teacherId,
        subjectId: mathsId,
        sectionId,
      }).expect(201);

      await request(app.getHttpServer())
        .delete(`/teacher-assignments/${created.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      const response = await request(app.getHttpServer())
        .get(`/teacher-assignments?teacherId=${teacherId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(response.body).toEqual([]);
    });

    it('rejects deleting an unknown id with a 404', async () => {
      await request(app.getHttpServer())
        .delete(`/teacher-assignments/${MISSING_ID}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });
  });

  describe('role access', () => {
    it('lets a TEACHER read the list but not write to it', async () => {
      await request(app.getHttpServer())
        .get('/teacher-assignments')
        .set('Authorization', `Bearer ${teacherToken}`)
        .expect(200);

      await createAssignment(teacherToken, { teacherId: MISSING_ID, subjectId: mathsId }).expect(403);

      await request(app.getHttpServer())
        .delete(`/teacher-assignments/${MISSING_ID}`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .expect(403);
    });
  });
});
