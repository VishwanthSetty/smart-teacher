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
    update: {},
    create: {
      email: 'admin@smartteacher.dev',
      name: 'Ada Admin',
      role: Role.ADMIN,
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
    update: {},
    create: {
      email: 'admin-b@smartteacher.dev',
      name: 'Beth Admin',
      role: Role.ADMIN,
      status: UserStatus.ACTIVE,
      passwordHash,
      schoolId: schoolB.id,
    },
  });

  console.log(
    `Seeded ${SUPER_ADMIN_EMAIL} (SUPER_ADMIN, no school), plus admin@smartteacher.dev and ` +
      `teacher@smartteacher.dev in school "${DEMO_SCHOOL_SLUG}", and admin-b@smartteacher.dev in ` +
      `school "${DEMO_SCHOOL_B_SLUG}" (password: ${SEED_PASSWORD})`,
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
