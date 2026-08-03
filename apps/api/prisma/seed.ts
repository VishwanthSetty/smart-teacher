import { PrismaClient, Role, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const SEED_PASSWORD = 'Passw0rd!';
const SUPER_ADMIN_EMAIL = 'superadmin@smartteacher.dev';

/**
 * Bootstraps the one account that cannot be created through the product: the platform
 * super admin, who has no tenant and so has nobody above them to invite them.
 *
 * Everything else is deliberately NOT seeded — schools, school users, grade levels,
 * subjects, videos, content entitlements, sections and enrolments. A fresh environment
 * starts empty and an operator creates them through the app, so nothing here can drift
 * from what real onboarding produces. E2e fixtures live in `test/utils/` instead
 * (`global-setup.ts` for tenants and accounts, `content-fixtures.ts` for platform
 * content) — do not move them back here.
 */
async function main() {
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);

  // Platform-level super admin has no tenant, so it can't be keyed by the composite
  // (schoolId, email) upsert — look it up by the null-tenant scope instead.
  const existingSuperAdmin = await prisma.user.findFirst({
    where: { email: SUPER_ADMIN_EMAIL, schoolId: null },
  });
  if (existingSuperAdmin) {
    console.log(`${SUPER_ADMIN_EMAIL} (SUPER_ADMIN, no school) already exists — nothing to seed`);
    return;
  }

  await prisma.user.create({
    data: {
      email: SUPER_ADMIN_EMAIL,
      name: 'Sam Super',
      role: Role.SUPER_ADMIN,
      status: UserStatus.ACTIVE,
      passwordHash,
    },
  });

  console.log(`Seeded ${SUPER_ADMIN_EMAIL} (SUPER_ADMIN, no school) (password: ${SEED_PASSWORD})`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
