import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import request from 'supertest';

export async function login(
  app: INestApplication,
  email: string,
  password: string,
  schoolSlug?: string,
): Promise<string> {
  const response = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email, password, schoolSlug })
    .expect(200);
  return response.body.accessToken;
}

// One seeded account per role (apps/api/prisma/seed.ts), so the RBAC matrix can iterate
// Object.values(Role) without hardcoding emails at each call site.
export const SEED_ACCOUNTS: Record<Role, { email: string; schoolSlug?: string }> = {
  [Role.SUPER_ADMIN]: { email: 'superadmin@smartteacher.dev' },
  [Role.SCHOOL_ADMIN]: { email: 'admin@smartteacher.dev', schoolSlug: 'demo-school' },
  [Role.TEACHER]: { email: 'teacher@smartteacher.dev', schoolSlug: 'demo-school' },
  [Role.STUDENT]: { email: 'student@smartteacher.dev', schoolSlug: 'demo-school' },
};

export const SEED_PASSWORD = 'Passw0rd!';

export async function loginAllRoles(app: INestApplication): Promise<Record<Role, string>> {
  const tokens = {} as Record<Role, string>;
  for (const role of Object.values(Role)) {
    const account = SEED_ACCOUNTS[role];
    tokens[role] = await login(app, account.email, SEED_PASSWORD, account.schoolSlug);
  }
  return tokens;
}
