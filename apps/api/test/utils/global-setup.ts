import { PrismaClient, Role, UserStatus } from '@prisma/client';
import { SEED_PASSWORD } from './login';

/**
 * Tenants and accounts the e2e suite logs in as. They used to ship in `prisma/seed.ts`,
 * which now provisions only the platform super admin — a real environment starts with no
 * schools, and an operator creates them. Runs once per jest run (`globalSetup` in
 * jest-e2e.json), before any spec, so no spec has to provision them itself.
 *
 * Uses its own PrismaClient rather than the app's PrismaService: there is no Nest
 * application here, and the tenant guard extension would reject writes to School B
 * without a request context.
 */

export const SUPER_ADMIN_EMAIL = 'superadmin@smartteacher.dev';
export const DEMO_SCHOOL_SLUG = 'demo-school';
export const DEMO_SCHOOL_B_SLUG = 'demo-school-b';

// School B needs a TEACHER, not just an admin: "watch entitled videos" is a
// TEACHER/STUDENT capability, so proving that a school with no entitlements sees an empty
// library over HTTP requires an account that is allowed to call GET /videos.
const SCHOOL_USERS = [
  { slug: DEMO_SCHOOL_SLUG, email: 'admin@smartteacher.dev', name: 'Ada Admin', role: Role.SCHOOL_ADMIN },
  { slug: DEMO_SCHOOL_SLUG, email: 'teacher@smartteacher.dev', name: 'Tom Teacher', role: Role.TEACHER },
  {
    slug: DEMO_SCHOOL_SLUG,
    email: 'student@smartteacher.dev',
    name: 'Sid Student',
    role: Role.STUDENT,
    firstName: 'Sid',
    lastName: 'Student',
  },
  { slug: DEMO_SCHOOL_B_SLUG, email: 'admin-b@smartteacher.dev', name: 'Beth Admin', role: Role.SCHOOL_ADMIN },
  { slug: DEMO_SCHOOL_B_SLUG, email: 'teacher-b@smartteacher.dev', name: 'Trish Teacher', role: Role.TEACHER },
];

export default async function globalSetup(): Promise<void> {
  // Imported lazily so this module stays cheap for specs that only want the constants.
  const bcrypt = await import('bcrypt');
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);

  const prisma = new PrismaClient();

  try {
    // Platform-level super admin has no tenant, so it can't be keyed by the composite
    // (schoolId, email) upsert — look it up by the null-tenant scope instead.
    const existingSuperAdmin = await prisma.user.findFirst({
      where: { email: SUPER_ADMIN_EMAIL, schoolId: null },
    });
    if (existingSuperAdmin) {
      await prisma.user.update({
        where: { id: existingSuperAdmin.id },
        data: { passwordHash, status: UserStatus.ACTIVE },
      });
    } else {
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

    // A second tenant lets e2e specs prove School A cannot read or write School B's data.
    const schools = new Map<string, string>();
    for (const [slug, name] of [
      [DEMO_SCHOOL_SLUG, 'Demo School'],
      [DEMO_SCHOOL_B_SLUG, 'Demo School B'],
    ]) {
      const school = await prisma.school.upsert({
        where: { slug },
        update: { status: 'ACTIVE' },
        create: { name, slug, academicYear: '2025-2026' },
      });
      schools.set(slug, school.id);
    }

    // Password, role and status are reset on every run, not left to `update: {}`: the auth
    // suites deliberately disable accounts, reset passwords and suspend schools, so a run
    // that failed part-way through would otherwise poison every later run.
    for (const user of SCHOOL_USERS) {
      const schoolId = schools.get(user.slug);
      if (!schoolId) {
        throw new Error(`School fixture "${user.slug}" was not created`);
      }
      const data = {
        name: user.name,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        status: UserStatus.ACTIVE,
        passwordHash,
      };
      await prisma.user.upsert({
        where: { schoolId_email: { schoolId, email: user.email } },
        update: data,
        create: { ...data, email: user.email, schoolId },
      });
    }
  } finally {
    await prisma.$disconnect();
  }
}
