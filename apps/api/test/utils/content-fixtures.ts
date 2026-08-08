import { CurriculumStatus, PrismaClient, VideoStatus } from '@prisma/client';
import { DEMO_SCHOOL_SLUG, DEMO_SCHOOL_B_SLUG } from './global-setup';

/**
 * Platform content, curricula, entitlements, sections and enrolments used to ship in
 * `prisma/seed.ts`. They were removed from the seed so a freshly provisioned
 * environment starts with an empty taxonomy and no school entitled to anything —
 * an operator grants those deliberately. The e2e suite still needs the fixtures,
 * so they live here and are provisioned by the specs that assert against them.
 *
 * Depends on the tenants and accounts `global-setup.ts` provisions, so it must run after
 * them — call it from a spec's `beforeAll`, not at module load.
 *
 * Uses its own PrismaClient rather than the app's PrismaService: the tenant guard
 * extension has no request context here, and writing School B's rows would be
 * rejected by it anyway.
 */

export const ENTITLED_VIDEO_TITLE = 'Grade 5 Maths — Fractions';
export const SCIENCE_VIDEO_TITLE = 'Grade 5 Science — The Water Cycle';
export const UNENTITLED_VIDEO_TITLE = 'Grade 6 Maths — Ratios';

export const STANDARD_SCHEMA_CODE = 'chapter-topic';

export interface ContentFixtures {
  grade5Id: string;
  grade6Id: string;
  mathsId: string;
  scienceId: string;
  schemaId: string;
  /** demo-school's only entitlement. */
  g5MathsCurriculumId: string;
  g5ScienceCurriculumId: string;
  g6MathsCurriculumId: string;
  /** Published-but-unentitled and draft curricula, for the two negative cases. */
  draftCurriculumId: string;
  /** A content-holding (Topic) node under the entitled curriculum. */
  g5MathsTopicId: string;
  /** A non-content-holding (Chapter) node under the same curriculum. */
  g5MathsChapterId: string;
  schoolId: string;
  schoolBId: string;
  g5SectionAId: string;
  g5SectionBId: string;
  g6SectionAId: string;
  schoolBG5SectionAId: string;
}

export async function seedContentFixtures(): Promise<ContentFixtures> {
  const prisma = new PrismaClient();

  try {
    const school = await prisma.school.findUniqueOrThrow({ where: { slug: DEMO_SCHOOL_SLUG } });
    const schoolB = await prisma.school.findUniqueOrThrow({ where: { slug: DEMO_SCHOOL_B_SLUG } });

    const [grade5, grade6] = await Promise.all([
      prisma.gradeLevel.upsert({
        where: { name: 'Grade 5' },
        update: {},
        create: { name: 'Grade 5', rank: 5 },
      }),
      prisma.gradeLevel.upsert({
        where: { name: 'Grade 6' },
        update: {},
        create: { name: 'Grade 6', rank: 6 },
      }),
    ]);

    const [maths, science] = await Promise.all([
      prisma.subject.upsert({
        where: { code: 'maths' },
        update: { status: 'ACTIVE' },
        create: { name: 'Mathematics', code: 'maths' },
      }),
      prisma.subject.upsert({
        where: { code: 'science' },
        update: { status: 'ACTIVE' },
        create: { name: 'Science', code: 'science' },
      }),
    ]);

    // "Chapter -> Topic": two levels, and only the deeper one may hold videos. That
    // asymmetry is what the "videos cannot hang off a chapter" tests assert against.
    const schema = await prisma.curriculumSchema.upsert({
      where: { code: STANDARD_SCHEMA_CODE },
      update: {},
      create: {
        name: 'Chapter / Topic',
        code: STANDARD_SCHEMA_CODE,
        levels: {
          create: [
            { depth: 1, name: 'Chapter', canHoldContent: false },
            { depth: 2, name: 'Topic', canHoldContent: true },
          ],
        },
      },
    });

    // Three published curricula plus one DRAFT. The draft is the fixture that proves
    // publication gating: demo-school is granted it, and must still not see it.
    const curriculumSpecs = [
      { key: 'g5Maths', grade: grade5, subject: maths, status: CurriculumStatus.PUBLISHED },
      { key: 'g5Science', grade: grade5, subject: science, status: CurriculumStatus.PUBLISHED },
      { key: 'g6Maths', grade: grade6, subject: maths, status: CurriculumStatus.PUBLISHED },
      { key: 'draft', grade: grade6, subject: science, status: CurriculumStatus.DRAFT },
    ] as const;

    const curricula = new Map<string, string>();
    for (const spec of curriculumSpecs) {
      const row = await prisma.curriculum.upsert({
        where: {
          gradeLevelId_subjectId: { gradeLevelId: spec.grade.id, subjectId: spec.subject.id },
        },
        // Converged, not created-if-absent: a run that left a curriculum unpublished (or a
        // dev DB edited by hand) would otherwise silently empty the entitled library.
        update: {
          schemaId: schema.id,
          status: spec.status,
          publishedAt: spec.status === CurriculumStatus.PUBLISHED ? new Date() : null,
        },
        create: {
          gradeLevelId: spec.grade.id,
          subjectId: spec.subject.id,
          schemaId: schema.id,
          status: spec.status,
          publishedAt: spec.status === CurriculumStatus.PUBLISHED ? new Date() : null,
        },
      });
      curricula.set(spec.key, row.id);
    }

    // One chapter with one topic under each curriculum. Videos hang off the topic,
    // because the Chapter level is not content-holding.
    const nodes = new Map<string, { chapterId: string; topicId: string }>();
    for (const [key, curriculumId] of curricula) {
      const chapter = await upsertNode(prisma, {
        curriculumId,
        parentId: null,
        code: 'ch-01',
        title: 'Chapter 1',
        depth: 1,
        parentPath: '/',
        sortOrder: 1000,
      });
      const topic = await upsertNode(prisma, {
        curriculumId,
        parentId: chapter.id,
        code: 'tp-01',
        title: 'Topic 1.1',
        depth: 2,
        parentPath: chapter.path,
        sortOrder: 1000,
      });
      nodes.set(key, { chapterId: chapter.id, topicId: topic.id });
    }

    const videos = [
      { externalId: 'demo-g5-maths-01', title: ENTITLED_VIDEO_TITLE, curriculumKey: 'g5Maths' },
      { externalId: 'demo-g5-sci-01', title: SCIENCE_VIDEO_TITLE, curriculumKey: 'g5Science' },
      { externalId: 'demo-g6-maths-01', title: UNENTITLED_VIDEO_TITLE, curriculumKey: 'g6Maths' },
    ];

    for (const video of videos) {
      const topicId = nodes.get(video.curriculumKey)?.topicId;
      if (topicId === undefined) {
        throw new Error(`No topic node seeded for ${video.curriculumKey}`);
      }
      const data = {
        title: video.title,
        externalId: video.externalId,
        durationSecs: 480,
        contentNodeId: topicId,
        // READY, not the UPLOADING default: these stand in for transcoded content, and
        // every school-facing read filters on READY. Left at the default they would be
        // invisible to teachers and students and every library test would assert on an
        // empty list.
        status: VideoStatus.READY,
      };
      // Converged, not created-if-absent: a dev DB where the taxonomy was edited by hand
      // (e.g. "Grade 5" renamed, so a later run created a second row) leaves these videos
      // pointing at the old node, which silently empties the entitled library.
      const existing = await prisma.video.findFirst({ where: { externalId: video.externalId } });
      const row = existing
        ? await prisma.video.update({ where: { id: existing.id }, data })
        : await prisma.video.create({ data });
      await prisma.video.update({
        where: { id: row.id },
        data: {
          playlistKey: `videos/${row.id}/master.m3u8`,
          posterKey: `videos/${row.id}/poster.jpg`,
        },
      });
      await prisma.videoRendition.deleteMany({ where: { videoId: row.id } });
      await prisma.videoRendition.createMany({
        data: [
          { videoId: row.id, name: '360p', width: 640, height: 360, bitrateKbps: 800, playlistKey: `videos/${row.id}/360p/playlist.m3u8` },
          { videoId: row.id, name: '720p', width: 1280, height: 720, bitrateKbps: 2500, playlistKey: `videos/${row.id}/720p/playlist.m3u8` },
        ],
      });
    }

    // Deliberately asymmetric: demo-school is entitled to exactly one *published*
    // curriculum and demo-school-b to none. That asymmetry is the fixture the F-02
    // entitlement tests assert against — granting everything here would make them pass
    // vacuously.
    //
    // The DRAFT grant is deliberate too: it proves that holding an entitlement is not
    // enough, because ContentEntitlementsService filters reads to PUBLISHED.
    const grants = [curricula.get('g5Maths'), curricula.get('draft')];
    for (const curriculumId of grants) {
      if (curriculumId === undefined) {
        throw new Error('Curriculum fixture missing before granting');
      }
      await prisma.schoolContentEntitlement.upsert({
        where: { schoolId_curriculumId: { schoolId: school.id, curriculumId } },
        update: {},
        create: { schoolId: school.id, curriculumId },
      });
    }

    // demo-school-b also gets a "Grade 5 - A" to prove the (schoolId, gradeLevelId, name)
    // uniqueness is per-tenant, not global.
    const sections = [
      { schoolId: school.id, gradeLevelId: grade5.id, name: 'A' },
      { schoolId: school.id, gradeLevelId: grade5.id, name: 'B' },
      { schoolId: school.id, gradeLevelId: grade6.id, name: 'A' },
      { schoolId: schoolB.id, gradeLevelId: grade5.id, name: 'A' },
    ];
    const [g5SectionA, g5SectionB, g6SectionA, schoolBG5SectionA] = await Promise.all(
      sections.map((section) =>
        prisma.section.upsert({
          where: {
            schoolId_gradeLevelId_name: {
              schoolId: section.schoolId,
              gradeLevelId: section.gradeLevelId,
              name: section.name,
            },
          },
          update: {},
          create: section,
        }),
      ),
    );

    // demo-school's only live entitlement is the Grade 5 Mathematics curriculum, so
    // enrolling the fixture student into Grade 5 - A keeps every video-library test
    // meaningful under the F-06 narrowing: a student with no active enrollment sees
    // nothing at all.
    const student = await prisma.user.findUniqueOrThrow({
      where: { schoolId_email: { schoolId: school.id, email: 'student@smartteacher.dev' } },
    });
    const existingEnrollment = await prisma.enrollment.findFirst({
      where: { userId: student.id, status: 'ACTIVE' },
    });
    if (!existingEnrollment) {
      await prisma.enrollment.create({
        data: {
          schoolId: school.id,
          userId: student.id,
          sectionId: g5SectionA.id,
          rollNumber: '1',
        },
      });
    }

    const g5MathsNodes = nodes.get('g5Maths');
    if (g5MathsNodes === undefined) {
      throw new Error('Grade 5 Mathematics nodes missing');
    }

    return {
      grade5Id: grade5.id,
      grade6Id: grade6.id,
      mathsId: maths.id,
      scienceId: science.id,
      schemaId: schema.id,
      g5MathsCurriculumId: required(curricula, 'g5Maths'),
      g5ScienceCurriculumId: required(curricula, 'g5Science'),
      g6MathsCurriculumId: required(curricula, 'g6Maths'),
      draftCurriculumId: required(curricula, 'draft'),
      g5MathsTopicId: g5MathsNodes.topicId,
      g5MathsChapterId: g5MathsNodes.chapterId,
      schoolId: school.id,
      schoolBId: schoolB.id,
      g5SectionAId: g5SectionA.id,
      g5SectionBId: g5SectionB.id,
      g6SectionAId: g6SectionA.id,
      schoolBG5SectionAId: schoolBG5SectionA.id,
    };
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * ContentNode's path derives from its own generated id, so the row has to exist before
 * the path can be written — the same create-then-update the service does. Upserting on
 * (curriculumId, code) keeps a re-run idempotent.
 */
async function upsertNode(
  prisma: PrismaClient,
  input: {
    curriculumId: string;
    parentId: string | null;
    code: string;
    title: string;
    depth: number;
    parentPath: string;
    sortOrder: number;
  },
): Promise<{ id: string; path: string }> {
  const existing = await prisma.contentNode.findUnique({
    where: { curriculumId_code: { curriculumId: input.curriculumId, code: input.code } },
    select: { id: true, path: true },
  });
  if (existing !== null) {
    // Converge shared fixtures on every run. Authoring tests and local exploration may
    // rename or reorder a node, and create-if-absent would make later read tests depend
    // on that stale database state.
    return prisma.contentNode.update({
      where: { id: existing.id },
      data: {
        parentId: input.parentId,
        depth: input.depth,
        path: `${input.parentPath}${existing.id}/`,
        title: input.title,
        sortOrder: input.sortOrder,
      },
      select: { id: true, path: true },
    });
  }

  const created = await prisma.contentNode.create({
    data: {
      curriculumId: input.curriculumId,
      parentId: input.parentId,
      depth: input.depth,
      path: '/',
      code: input.code,
      title: input.title,
      sortOrder: input.sortOrder,
    },
    select: { id: true },
  });
  return prisma.contentNode.update({
    where: { id: created.id },
    data: { path: `${input.parentPath}${created.id}/` },
    select: { id: true, path: true },
  });
}

function required(curricula: ReadonlyMap<string, string>, key: string): string {
  const id = curricula.get(key);
  if (id === undefined) {
    throw new Error(`Curriculum fixture "${key}" was not seeded`);
  }
  return id;
}
