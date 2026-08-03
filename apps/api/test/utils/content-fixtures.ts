import { PrismaClient, VideoStatus } from '@prisma/client';
import { DEMO_SCHOOL_SLUG, DEMO_SCHOOL_B_SLUG } from './global-setup';

/**
 * Platform content, entitlements, sections and enrolments used to ship in
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

export interface ContentFixtures {
  grade5Id: string;
  grade6Id: string;
  mathsId: string;
  scienceId: string;
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

    const videos = [
      { externalId: 'demo-g5-maths-01', title: ENTITLED_VIDEO_TITLE, grade: grade5, subject: maths },
      { externalId: 'demo-g5-sci-01', title: SCIENCE_VIDEO_TITLE, grade: grade5, subject: science },
      { externalId: 'demo-g6-maths-01', title: UNENTITLED_VIDEO_TITLE, grade: grade6, subject: maths },
    ];

    for (const video of videos) {
      const data = {
        title: video.title,
        externalId: video.externalId,
        durationSecs: 480,
        gradeLevelId: video.grade.id,
        subjectId: video.subject.id,
        // READY, not the UPLOADING default: these stand in for transcoded content, and
        // every school-facing read filters on READY. Left at the default they would be
        // invisible to teachers and students and every library test would assert on an
        // empty list.
        status: VideoStatus.READY,
      };
      // Converged, not created-if-absent: a dev DB where the taxonomy was edited by hand
      // (e.g. "Grade 5" renamed, so a later run created a second row) leaves these videos
      // pointing at the old grade level, which silently empties the entitled library.
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

    // Deliberately asymmetric: demo-school is entitled to exactly one (grade, subject)
    // pair and demo-school-b to none. That asymmetry is the fixture the F-02 entitlement
    // tests assert against — granting everything here would make them pass vacuously.
    await prisma.schoolContentEntitlement.upsert({
      where: {
        schoolId_gradeLevelId_subjectId: {
          schoolId: school.id,
          gradeLevelId: grade5.id,
          subjectId: maths.id,
        },
      },
      update: {},
      create: { schoolId: school.id, gradeLevelId: grade5.id, subjectId: maths.id },
    });

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

    // demo-school's only entitlement is (Grade 5, Mathematics), so enrolling the fixture
    // student into Grade 5 - A keeps every video-library test meaningful under the F-06
    // narrowing: a student with no active enrollment sees nothing at all.
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

    return {
      grade5Id: grade5.id,
      grade6Id: grade6.id,
      mathsId: maths.id,
      scienceId: science.id,
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
