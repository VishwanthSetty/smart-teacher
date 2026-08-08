import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import request from 'supertest';
import { createE2eApp } from './utils/e2e-app';
import { loginAllRoles, login, SEED_PASSWORD } from './utils/login';
import { seedContentFixtures, ENTITLED_VIDEO_TITLE } from './utils/content-fixtures';

const MISSING_ID = 'missing-00000000000000000000000';

interface TreeNode {
  id: string;
  title: string;
  levelName: string;
  canHoldContent: boolean;
  children: TreeNode[];
  videos: Array<{ id: string; title: string }>;
  videoCountDeep: number;
}

/**
 * The school-facing curriculum structure — the answer to "a student in a grade sees the
 * structure the operator defined".
 *
 * The fixtures are deliberately asymmetric and every assertion here leans on that:
 * demo-school holds one published curriculum (Grade 5 Mathematics) plus one DRAFT grant,
 * and demo-school-b holds nothing. Granting more in content-fixtures.ts would make these
 * pass vacuously.
 */
describe('Content tree (e2e)', () => {
  let app: INestApplication;
  let tokens: Record<Role, string>;
  let teacherB: string;
  let g5MathsCurriculumId: string;
  let g5ScienceCurriculumId: string;
  let g6MathsCurriculumId: string;
  let draftCurriculumId: string;

  const get = (path: string, token: string) =>
    request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    const fixtures = await seedContentFixtures();
    g5MathsCurriculumId = fixtures.g5MathsCurriculumId;
    g5ScienceCurriculumId = fixtures.g5ScienceCurriculumId;
    g6MathsCurriculumId = fixtures.g6MathsCurriculumId;
    draftCurriculumId = fixtures.draftCurriculumId;

    app = await createE2eApp();
    tokens = await loginAllRoles(app);
    teacherB = await login(app, 'teacher-b@smartteacher.dev', SEED_PASSWORD, 'demo-school-b');
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /curricula', () => {
    it('lists exactly the published curricula the school is entitled to', async () => {
      const res = await get('/curricula', tokens[Role.TEACHER]).expect(200);

      expect(res.body.map((c: { id: string }) => c.id)).toEqual([g5MathsCurriculumId]);
    });

    it("lists the school's entitled curriculum for a SCHOOL_ADMIN", async () => {
      const res = await get('/curricula', tokens[Role.SCHOOL_ADMIN]).expect(200);

      expect(res.body.map((c: { id: string }) => c.id)).toEqual([g5MathsCurriculumId]);
    });

    // The unentitled-tenant proof. teacher-b@ exists precisely so this can be asserted
    // over HTTP by a non-admin inside the other tenant.
    it('returns an empty list for a school entitled to nothing', async () => {
      const res = await get('/curricula', teacherB).expect(200);

      expect(res.body).toEqual([]);
    });

    // Holding a grant is not enough. The fixtures grant demo-school the DRAFT curriculum
    // on purpose, so this proves publication gating rather than entitlement gating.
    it('hides a granted curriculum that has not been published', async () => {
      const res = await get('/curricula', tokens[Role.TEACHER]).expect(200);

      expect(res.body.map((c: { id: string }) => c.id)).not.toContain(draftCurriculumId);
    });

    it('labels each curriculum with its grade level and subject', async () => {
      const res = await get('/curricula', tokens[Role.TEACHER]).expect(200);

      expect(res.body[0]).toMatchObject({
        gradeLevelName: 'Grade 5',
        subjectName: 'Mathematics',
      });
    });

    // SUPER_ADMIN authors through /admin/curricula rather than this tenant-scoped surface.
    it.each([[Role.SUPER_ADMIN]])('403s a %s', async (role) => {
      await get('/curricula', tokens[role]).expect(403);
    });

    it('401s an unauthenticated caller', async () => {
      await request(app.getHttpServer()).get('/curricula').expect(401);
    });
  });

  describe('GET /curricula/:id/tree', () => {
    it('returns an entitled curriculum tree for a SCHOOL_ADMIN', async () => {
      const res = await get(
        `/curricula/${g5MathsCurriculumId}/tree`,
        tokens[Role.SCHOOL_ADMIN],
      ).expect(200);

      expect(res.body.curriculumId).toBe(g5MathsCurriculumId);
    });

    it('returns the authored structure, nested, with videos on their nodes', async () => {
      const res = await get(`/curricula/${g5MathsCurriculumId}/tree`, tokens[Role.TEACHER]).expect(200);

      const nodes = res.body.nodes as TreeNode[];
      expect(nodes).toHaveLength(1);
      expect(nodes[0]).toMatchObject({ title: 'Chapter 1', levelName: 'Chapter', canHoldContent: false });

      const topic = nodes[0].children.find((child) => child.title === 'Topic 1.1');
      if (!topic) throw new Error('Entitled topic fixture missing from content tree');
      expect(topic).toMatchObject({ title: 'Topic 1.1', levelName: 'Topic', canHoldContent: true });
      expect(topic.videos.map((video) => video.title)).toEqual([ENTITLED_VIDEO_TITLE]);
    });

    // So a client can grey out an empty branch without walking the subtree itself.
    it('rolls the video count up to the ancestor', async () => {
      const res = await get(`/curricula/${g5MathsCurriculumId}/tree`, tokens[Role.TEACHER]).expect(200);

      const nodes = res.body.nodes as TreeNode[];
      expect(nodes[0].videoCountDeep).toBe(1);
      expect(nodes[0].videos).toEqual([]);
    });

    // 404, never 403: an unentitled curriculum must be indistinguishable from one that
    // does not exist, the same don't-confirm-existence rule as a cross-tenant miss.
    it('404s a published curriculum the school holds no entitlement for', async () => {
      await get(`/curricula/${g5ScienceCurriculumId}/tree`, tokens[Role.TEACHER]).expect(404);
      await get(`/curricula/${g6MathsCurriculumId}/tree`, tokens[Role.TEACHER]).expect(404);
    });

    it('404s a granted-but-unpublished curriculum', async () => {
      await get(`/curricula/${draftCurriculumId}/tree`, tokens[Role.TEACHER]).expect(404);
    });

    // The cross-tenant proof: school B can name school A's curriculum id and still gets
    // nothing back.
    it("404s another school's entitled curriculum", async () => {
      await get(`/curricula/${g5MathsCurriculumId}/tree`, teacherB).expect(404);
    });

    it('404s a curriculum that does not exist', async () => {
      await get(`/curricula/${MISSING_ID}/tree`, tokens[Role.TEACHER]).expect(404);
    });
  });

  describe('STUDENT narrowing', () => {
    // The student is enrolled in Grade 5 - A, and demo-school's only published grant is
    // the Grade 5 curriculum — so grade narrowing and entitlement narrowing agree here.
    it("shows a student the curricula for their enrolled grade level", async () => {
      const res = await get('/curricula', tokens[Role.STUDENT]).expect(200);

      expect(res.body.map((c: { id: string }) => c.id)).toEqual([g5MathsCurriculumId]);
    });

    it('lets a student open the tree for their own grade level', async () => {
      const res = await get(`/curricula/${g5MathsCurriculumId}/tree`, tokens[Role.STUDENT]).expect(200);

      const topic = (res.body.nodes as TreeNode[])[0].children.find(
        (child) => child.title === 'Topic 1.1',
      );
      if (!topic) throw new Error('Entitled topic fixture missing from student content tree');
      expect(topic.videos).toHaveLength(1);
    });

    // A student must never reach a grade level above or below their own, even one their
    // school is entitled to. Single reads narrow with the list because both resolve
    // through ActorContentScopeService.
    it("404s a curriculum outside the student's grade level", async () => {
      await get(`/curricula/${g6MathsCurriculumId}/tree`, tokens[Role.STUDENT]).expect(404);
    });
  });
});
