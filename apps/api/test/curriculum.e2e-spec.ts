import { INestApplication } from '@nestjs/common';
import { PrismaClient, Role } from '@prisma/client';
import request from 'supertest';
import { createE2eApp } from './utils/e2e-app';
import { loginAllRoles } from './utils/login';
import { seedContentFixtures } from './utils/content-fixtures';

const MISSING_ID = 'missing-00000000000000000000000';

// Everything this suite creates carries this prefix so a run that failed part-way can be
// cleaned up idempotently without touching the shared fixtures.
const RUN = `e2e-curriculum-${Date.now()}`;

// Curriculum authoring (SUPER_ADMIN). The rules under test are the ones that make the
// hierarchy configurable *and* safe: a node can only exist at a depth the schema
// declares, a move cannot create a cycle or outgrow the vocabulary, and a delete cannot
// take content down with it.
describe('Curriculum authoring (e2e)', () => {
  let app: INestApplication;
  let tokens: Record<Role, string>;
  let grade6Id: string;
  let scienceId: string;
  let schemaId: string;

  const asSuperAdmin = () => tokens[Role.SUPER_ADMIN];
  const post = (path: string, token: string) =>
    request(app.getHttpServer()).post(path).set('Authorization', `Bearer ${token}`);
  const get = (path: string, token: string) =>
    request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${token}`);
  const patch = (path: string, token: string) =>
    request(app.getHttpServer()).patch(path).set('Authorization', `Bearer ${token}`);
  const del = (path: string, token: string) =>
    request(app.getHttpServer()).delete(path).set('Authorization', `Bearer ${token}`);

  // A fresh grade level per test that needs its own curriculum: (gradeLevel, subject) is
  // unique, so suites cannot share one without colliding.
  let gradeRank = 90;
  async function createGradeLevel(): Promise<string> {
    gradeRank += 1;
    const res = await post('/admin/grade-levels', asSuperAdmin())
      .send({ name: `${RUN} Grade ${gradeRank}`, rank: gradeRank })
      .expect(201);
    return res.body.id;
  }

  async function createCurriculum(overrides: Record<string, unknown> = {}): Promise<string> {
    const res = await post('/admin/curricula', asSuperAdmin())
      .send({
        gradeLevelId: await createGradeLevel(),
        subjectId: scienceId,
        schemaId,
        ...overrides,
      })
      .expect(201);
    return res.body.id;
  }

  async function addNode(
    curriculumId: string,
    body: Record<string, unknown>,
  ): Promise<{ id: string; depth: number; levelName: string }> {
    const res = await post(`/admin/curricula/${curriculumId}/nodes`, asSuperAdmin())
      .send(body)
      .expect(201);
    return res.body;
  }

  async function cleanUp(): Promise<void> {
    const prisma = new PrismaClient();
    try {
      await prisma.video.deleteMany({ where: { node: { curriculum: { gradeLevel: { name: { startsWith: RUN } } } } } });
      await prisma.contentNode.deleteMany({ where: { curriculum: { gradeLevel: { name: { startsWith: RUN } } } } });
      await prisma.curriculum.deleteMany({ where: { gradeLevel: { name: { startsWith: RUN } } } });
      await prisma.gradeLevel.deleteMany({ where: { name: { startsWith: RUN } } });
      await prisma.curriculumSchema.deleteMany({ where: { code: { startsWith: RUN } } });
    } finally {
      await prisma.$disconnect();
    }
  }

  beforeAll(async () => {
    const fixtures = await seedContentFixtures();
    scienceId = fixtures.scienceId;
    grade6Id = fixtures.grade6Id;
    schemaId = fixtures.schemaId;

    app = await createE2eApp();
    tokens = await loginAllRoles(app);
  });

  afterAll(async () => {
    await cleanUp();
    await app.close();
  });

  describe('schemas', () => {
    it('creates a schema with its levels in one call', async () => {
      const res = await post('/admin/curriculum-schemas', asSuperAdmin())
        .send({
          name: `${RUN} Unit / Chapter / Topic`,
          code: `${RUN}-three`,
          levels: [
            { depth: 1, name: 'Unit', canHoldContent: false },
            { depth: 2, name: 'Chapter', canHoldContent: false },
            { depth: 3, name: 'Topic', canHoldContent: true },
          ],
        })
        .expect(201);

      expect(res.body.levels.map((level: { name: string }) => level.name)).toEqual([
        'Unit',
        'Chapter',
        'Topic',
      ]);
    });

    // Levels 1 and 3 describe a tree with an unreachable floor: nothing could ever sit at
    // depth 3, because creating it needs a depth-2 parent the vocabulary forbids.
    it('400s on a gap in the level numbering', async () => {
      await post('/admin/curriculum-schemas', asSuperAdmin())
        .send({
          name: `${RUN} Gapped`,
          code: `${RUN}-gapped`,
          levels: [
            { depth: 1, name: 'Unit', canHoldContent: false },
            { depth: 3, name: 'Topic', canHoldContent: true },
          ],
        })
        .expect(400);
    });

    it('409s on a duplicate code', async () => {
      const body = {
        name: `${RUN} Dupe`,
        code: `${RUN}-dupe`,
        levels: [{ depth: 1, name: 'Only', canHoldContent: true }],
      };
      await post('/admin/curriculum-schemas', asSuperAdmin()).send(body).expect(201);
      await post('/admin/curriculum-schemas', asSuperAdmin()).send(body).expect(409);
    });

    it('clones a schema under a new code', async () => {
      const source = await post('/admin/curriculum-schemas', asSuperAdmin())
        .send({
          name: `${RUN} Source`,
          code: `${RUN}-source`,
          levels: [
            { depth: 1, name: 'Chapter', canHoldContent: false },
            { depth: 2, name: 'Topic', canHoldContent: true },
          ],
        })
        .expect(201);

      const clone = await post(`/admin/curriculum-schemas/${source.body.id}/clone`, asSuperAdmin())
        .send({ name: `${RUN} Clone`, code: `${RUN}-clone` })
        .expect(201);

      expect(clone.body.id).not.toBe(source.body.id);
      expect(clone.body.levels.map((level: { name: string }) => level.name)).toEqual([
        'Chapter',
        'Topic',
      ]);
    });

    // The FK is Restrict, so the pre-check is what turns a raw constraint violation into
    // a message an operator can act on.
    it('409s deleting a schema curricula still bind', async () => {
      await del(`/admin/curriculum-schemas/${schemaId}`, asSuperAdmin()).expect(409);
    });

    it('404s reading a schema that does not exist', async () => {
      await get(`/admin/curriculum-schemas/${MISSING_ID}`, asSuperAdmin()).expect(404);
    });
  });

  describe('curricula', () => {
    it('creates a curriculum in DRAFT carrying its level vocabulary', async () => {
      const res = await post('/admin/curricula', asSuperAdmin())
        .send({ gradeLevelId: await createGradeLevel(), subjectId: scienceId, schemaId })
        .expect(201);

      expect(res.body.status).toBe('DRAFT');
      expect(res.body.levels.map((level: { name: string }) => level.name)).toEqual([
        'Chapter',
        'Topic',
      ]);
    });

    // A curriculum IS the (grade, subject) pair, so a duplicate is a conflict rather than
    // a second row.
    it('409s a second curriculum for the same grade level and subject', async () => {
      await post('/admin/curricula', asSuperAdmin())
        .send({ gradeLevelId: grade6Id, subjectId: scienceId, schemaId })
        .expect(409);
    });

    it.each([
      ['grade level', () => ({ gradeLevelId: MISSING_ID, subjectId: scienceId, schemaId })],
      ['subject', () => ({ gradeLevelId: grade6Id, subjectId: MISSING_ID, schemaId })],
      ['schema', () => ({ gradeLevelId: grade6Id, subjectId: scienceId, schemaId: MISSING_ID })],
    ])('404s rather than 500s when the %s does not exist', async (_label, body) => {
      await post('/admin/curricula', asSuperAdmin()).send(body()).expect(404);
    });

    // Publishing an empty tree would hand an entitled school a card that opens onto
    // nothing, which reads as broken rather than unfinished.
    it('409s publishing a curriculum with no nodes', async () => {
      const id = await createCurriculum();

      await post(`/admin/curricula/${id}/publish`, asSuperAdmin()).expect(409);
    });

    it('publishes and unpublishes, stamping and clearing publishedAt', async () => {
      const id = await createCurriculum();
      await addNode(id, { parentId: null, code: 'ch-01', title: 'Chapter 1' });

      const published = await post(`/admin/curricula/${id}/publish`, asSuperAdmin()).expect(200);
      expect(published.body.status).toBe('PUBLISHED');
      expect(published.body.publishedAt).not.toBeNull();

      const unpublished = await post(`/admin/curricula/${id}/unpublish`, asSuperAdmin()).expect(200);
      expect(unpublished.body.status).toBe('DRAFT');
      expect(unpublished.body.publishedAt).toBeNull();
    });

    // Publishing changes what every entitled school sees, so it reads as a deliberate
    // action rather than a field on a PATCH body.
    it('409s an attempt to publish through PATCH', async () => {
      const id = await createCurriculum();

      await patch(`/admin/curricula/${id}`, asSuperAdmin())
        .send({ status: 'PUBLISHED' })
        .expect(409);
    });

    it('409s unpublishing a curriculum that is not published', async () => {
      const id = await createCurriculum();

      await post(`/admin/curricula/${id}/unpublish`, asSuperAdmin()).expect(409);
    });

    // Nodes below the new vocabulary's deepest level would have no name, and no read
    // could label them.
    it('409s a schema swap that would strand nodes below the new deepest level', async () => {
      const id = await createCurriculum();
      const chapter = await addNode(id, { parentId: null, code: 'ch-01', title: 'Chapter 1' });
      await addNode(id, { parentId: chapter.id, code: 'tp-01', title: 'Topic 1.1' });

      const shallow = await post('/admin/curriculum-schemas', asSuperAdmin())
        .send({
          name: `${RUN} Shallow`,
          code: `${RUN}-shallow`,
          levels: [{ depth: 1, name: 'Only', canHoldContent: true }],
        })
        .expect(201);

      await patch(`/admin/curricula/${id}`, asSuperAdmin())
        .send({ schemaId: shallow.body.id })
        .expect(409);
    });

    it('deletes a curriculum nothing references, taking its tree with it', async () => {
      const id = await createCurriculum();
      await addNode(id, { parentId: null, code: 'ch-01', title: 'Chapter 1' });

      await del(`/admin/curricula/${id}`, asSuperAdmin()).expect(204);
      await get(`/admin/curricula/${id}`, asSuperAdmin()).expect(404);
    });
  });

  describe('content nodes', () => {
    it('labels a node with the level name its depth resolves to', async () => {
      const id = await createCurriculum();

      const chapter = await addNode(id, { parentId: null, code: 'ch-01', title: 'Chapter 1' });
      expect(chapter).toMatchObject({ depth: 1, levelName: 'Chapter' });

      const topic = await addNode(id, {
        parentId: chapter.id,
        code: 'tp-01',
        title: 'Topic 1.1',
      });
      expect(topic).toMatchObject({ depth: 2, levelName: 'Topic' });
    });

    // The rule that makes the vocabulary binding rather than decorative.
    it("409s a node deeper than the curriculum's schema declares", async () => {
      const id = await createCurriculum();
      const chapter = await addNode(id, { parentId: null, code: 'ch-01', title: 'Chapter 1' });
      const topic = await addNode(id, { parentId: chapter.id, code: 'tp-01', title: 'Topic 1.1' });

      await post(`/admin/curricula/${id}/nodes`, asSuperAdmin())
        .send({ parentId: topic.id, code: 'st-01', title: 'Sub-topic 1.1.1' })
        .expect(409);
    });

    it('409s a duplicate code within the same curriculum', async () => {
      const id = await createCurriculum();
      await addNode(id, { parentId: null, code: 'ch-01', title: 'Chapter 1' });

      await post(`/admin/curricula/${id}/nodes`, asSuperAdmin())
        .send({ parentId: null, code: 'ch-01', title: 'Another chapter' })
        .expect(409);
    });

    it('404s a parent belonging to another curriculum', async () => {
      const [first, second] = [await createCurriculum(), await createCurriculum()];
      const foreign = await addNode(first, { parentId: null, code: 'ch-01', title: 'Chapter 1' });

      await post(`/admin/curricula/${second}/nodes`, asSuperAdmin())
        .send({ parentId: foreign.id, code: 'tp-01', title: 'Topic' })
        .expect(404);
    });

    it('renames a node', async () => {
      const id = await createCurriculum();
      const chapter = await addNode(id, { parentId: null, code: 'ch-01', title: 'Chapter 1' });

      const res = await patch(`/admin/content-nodes/${chapter.id}`, asSuperAdmin())
        .send({ title: 'Renamed' })
        .expect(200);

      expect(res.body.title).toBe('Renamed');
    });

    it('moves a branch and re-parents every descendant with it', async () => {
      const id = await createCurriculum();
      const chapter1 = await addNode(id, { parentId: null, code: 'ch-01', title: 'Chapter 1' });
      const chapter2 = await addNode(id, { parentId: null, code: 'ch-02', title: 'Chapter 2' });
      const topic = await addNode(id, { parentId: chapter1.id, code: 'tp-01', title: 'Topic 1.1' });

      // Move the topic under the other chapter; depth is unchanged, parentage is not.
      const moved = await post(`/admin/content-nodes/${topic.id}/move`, asSuperAdmin())
        .send({ parentId: chapter2.id, position: 0 })
        .expect(200);

      expect(moved.body.parentId).toBe(chapter2.id);
      expect(moved.body.depth).toBe(2);

      const tree = await get(`/admin/curricula/${id}/tree`, asSuperAdmin()).expect(200);
      const rendered = tree.body.nodes as Array<{ id: string; children: Array<{ id: string }> }>;
      expect(rendered.find((node) => node.id === chapter1.id)?.children).toEqual([]);
      expect(rendered.find((node) => node.id === chapter2.id)?.children[0].id).toBe(topic.id);
    });

    // Re-parenting a node under its own descendant would detach the subtree from the root
    // and leave a cycle no read could terminate on.
    it('409s a move that would put a node inside itself', async () => {
      const id = await createCurriculum();
      const chapter = await addNode(id, { parentId: null, code: 'ch-01', title: 'Chapter 1' });
      const topic = await addNode(id, { parentId: chapter.id, code: 'tp-01', title: 'Topic 1.1' });

      await post(`/admin/content-nodes/${chapter.id}/move`, asSuperAdmin())
        .send({ parentId: topic.id, position: 0 })
        .expect(409);
    });

    it("409s a move that would push the branch past the schema's deepest level", async () => {
      const id = await createCurriculum();
      const chapter1 = await addNode(id, { parentId: null, code: 'ch-01', title: 'Chapter 1' });
      const chapter2 = await addNode(id, { parentId: null, code: 'ch-02', title: 'Chapter 2' });
      await addNode(id, { parentId: chapter1.id, code: 'tp-01', title: 'Topic 1.1' });

      // Chapter 1 carries a topic, so landing it at depth 2 would need a depth-3 level.
      await post(`/admin/content-nodes/${chapter1.id}/move`, asSuperAdmin())
        .send({ parentId: chapter2.id, position: 0 })
        .expect(409);
    });

    // Moving across curricula would change which schools can see the content without
    // touching a single entitlement.
    it('404s a move whose destination is in another curriculum', async () => {
      const [first, second] = [await createCurriculum(), await createCurriculum()];
      const source = await addNode(first, { parentId: null, code: 'ch-01', title: 'Chapter 1' });
      const destination = await addNode(second, { parentId: null, code: 'ch-01', title: 'Chapter 1' });

      await post(`/admin/content-nodes/${source.id}/move`, asSuperAdmin())
        .send({ parentId: destination.id, position: 0 })
        .expect(404);
    });

    it('reorders siblings without changing their parent', async () => {
      const id = await createCurriculum();
      const first = await addNode(id, { parentId: null, code: 'ch-01', title: 'Chapter 1' });
      const second = await addNode(id, { parentId: null, code: 'ch-02', title: 'Chapter 2' });

      await post(`/admin/content-nodes/${second.id}/move`, asSuperAdmin())
        .send({ parentId: null, position: 0 })
        .expect(200);

      const tree = await get(`/admin/curricula/${id}/tree`, asSuperAdmin()).expect(200);
      expect((tree.body.nodes as Array<{ id: string }>).map((node) => node.id)).toEqual([
        second.id,
        first.id,
      ]);
    });

    it('deletes a branch that holds no videos', async () => {
      const id = await createCurriculum();
      const chapter = await addNode(id, { parentId: null, code: 'ch-01', title: 'Chapter 1' });
      await addNode(id, { parentId: chapter.id, code: 'tp-01', title: 'Topic 1.1' });

      await del(`/admin/content-nodes/${chapter.id}`, asSuperAdmin()).expect(204);

      const tree = await get(`/admin/curricula/${id}/tree`, asSuperAdmin()).expect(200);
      expect(tree.body.nodes).toEqual([]);
    });

    // The self-relation cascades, so without this check deleting a chapter would silently
    // destroy every video filed under its topics.
    it('409s deleting a branch whose descendants still hold videos', async () => {
      const id = await createCurriculum();
      const chapter = await addNode(id, { parentId: null, code: 'ch-01', title: 'Chapter 1' });
      const topic = await addNode(id, { parentId: chapter.id, code: 'tp-01', title: 'Topic 1.1' });

      await post('/admin/videos', asSuperAdmin())
        .send({
          title: `${RUN} filed video`,
          contentNodeId: topic.id,
          contentType: 'video/mp4',
          sizeBytes: 1024,
        })
        .expect(201);

      await del(`/admin/content-nodes/${chapter.id}`, asSuperAdmin()).expect(409);
    });
  });
});
