import { PrismaClient, Role, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const SEED_PASSWORD = 'Passw0rd!';
const DEMO_SCHOOL_SLUG = 'demo-school';
const DEMO_SCHOOL_B_SLUG = 'demo-school-b';
const SUPER_ADMIN_EMAIL = 'superadmin@smartteacher.dev';

async function main() {
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);

  // Platform-level super admin has no tenant, so it can't be keyed by the composite
  // (schoolId, email) upsert — look it up by the null-tenant scope instead.
  const existingSuperAdmin = await prisma.user.findFirst({
    where: { email: SUPER_ADMIN_EMAIL, schoolId: null },
  });
  if (!existingSuperAdmin) {
    await prisma.user.create({
      data: {
        email: SUPER_ADMIN_EMAIL,
        name: 'Sam Super',
        role: Role.SUPER_ADMIN,
        status: UserStatus.ACTIVE,
        passwordHash,
      },
    });
  }

  const school = await prisma.school.upsert({
    where: { slug: DEMO_SCHOOL_SLUG },
    update: {},
    create: {
      name: 'Demo School',
      slug: DEMO_SCHOOL_SLUG,
      academicYear: '2025-2026',
    },
  });

  await prisma.user.upsert({
    where: { schoolId_email: { schoolId: school.id, email: 'admin@smartteacher.dev' } },
    // Converges a dev DB seeded before the ADMIN->SCHOOL_ADMIN migration onto the new role.
    update: { role: Role.SCHOOL_ADMIN },
    create: {
      email: 'admin@smartteacher.dev',
      name: 'Ada Admin',
      role: Role.SCHOOL_ADMIN,
      status: UserStatus.ACTIVE,
      passwordHash,
      schoolId: school.id,
    },
  });

  await prisma.user.upsert({
    where: { schoolId_email: { schoolId: school.id, email: 'teacher@smartteacher.dev' } },
    update: {},
    create: {
      email: 'teacher@smartteacher.dev',
      name: 'Tom Teacher',
      role: Role.TEACHER,
      status: UserStatus.ACTIVE,
      passwordHash,
      schoolId: school.id,
    },
  });

  await prisma.user.upsert({
    where: { schoolId_email: { schoolId: school.id, email: 'student@smartteacher.dev' } },
    update: {},
    create: {
      email: 'student@smartteacher.dev',
      name: 'Sid Student',
      role: Role.STUDENT,
      status: UserStatus.ACTIVE,
      passwordHash,
      schoolId: school.id,
    },
  });

  // A second tenant lets e2e tests prove School A cannot read or write School B's data.
  const schoolB = await prisma.school.upsert({
    where: { slug: DEMO_SCHOOL_B_SLUG },
    update: {},
    create: {
      name: 'Demo School B',
      slug: DEMO_SCHOOL_B_SLUG,
      academicYear: '2025-2026',
    },
  });

  await prisma.user.upsert({
    where: { schoolId_email: { schoolId: schoolB.id, email: 'admin-b@smartteacher.dev' } },
    update: { role: Role.SCHOOL_ADMIN },
    create: {
      email: 'admin-b@smartteacher.dev',
      name: 'Beth Admin',
      role: Role.SCHOOL_ADMIN,
      status: UserStatus.ACTIVE,
      passwordHash,
      schoolId: schoolB.id,
    },
  });

  // School B needs a TEACHER, not just an admin: "watch entitled videos" is a
  // TEACHER/STUDENT capability, so proving that a school with no entitlements sees an
  // empty library over HTTP requires an account that is allowed to call GET /videos.
  await prisma.user.upsert({
    where: { schoolId_email: { schoolId: schoolB.id, email: 'teacher-b@smartteacher.dev' } },
    update: {},
    create: {
      email: 'teacher-b@smartteacher.dev',
      name: 'Trish Teacher',
      role: Role.TEACHER,
      status: UserStatus.ACTIVE,
      passwordHash,
      schoolId: schoolB.id,
    },
  });

  // Platform content is global (no schoolId) — the reviewed F-02 exception. Access is
  // decided by SchoolContentEntitlement below, which is tenant-scoped.
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
      update: {},
      create: { name: 'Mathematics', code: 'maths' },
    }),
    prisma.subject.upsert({
      where: { code: 'science' },
      update: {},
      create: { name: 'Science', code: 'science' },
    }),
  ]);

  const videos = [
    { externalId: 'demo-g5-maths-01', title: 'Grade 5 Maths — Fractions', grade: grade5, subject: maths },
    { externalId: 'demo-g5-sci-01', title: 'Grade 5 Science — The Water Cycle', grade: grade5, subject: science },
    { externalId: 'demo-g6-maths-01', title: 'Grade 6 Maths — Ratios', grade: grade6, subject: maths },
  ];

  for (const video of videos) {
    const existing = await prisma.video.findFirst({ where: { externalId: video.externalId } });
    if (!existing) {
      await prisma.video.create({
        data: {
          title: video.title,
          externalId: video.externalId,
          durationSecs: 480,
          gradeLevelId: video.grade.id,
          subjectId: video.subject.id,
        },
      });
    }
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

  console.log(
    `Seeded ${SUPER_ADMIN_EMAIL} (SUPER_ADMIN, no school), plus admin@smartteacher.dev (SCHOOL_ADMIN), ` +
      `teacher@smartteacher.dev (TEACHER), and student@smartteacher.dev (STUDENT) in school ` +
      `"${DEMO_SCHOOL_SLUG}", and admin-b@smartteacher.dev (SCHOOL_ADMIN) plus ` +
      `teacher-b@smartteacher.dev (TEACHER) in school "${DEMO_SCHOOL_B_SLUG}" ` +
      `(password: ${SEED_PASSWORD})`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
