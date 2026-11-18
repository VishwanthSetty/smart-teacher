import { INestApplication } from '@nestjs/common';
import { Role, SchoolStatus } from '@prisma/client';
import request from 'supertest';
import { createE2eApp } from './utils/e2e-app';
import { loginAllRoles } from './utils/login';

describe('GET /users/me (e2e)', () => {
  let app: INestApplication;
  let tokens: Record<Role, string>;

  beforeAll(async () => {
    app = await createE2eApp();
    tokens = await loginAllRoles(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('joins the caller\'s school so the admin shell can render its name', async () => {
    const response = await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', `Bearer ${tokens[Role.SCHOOL_ADMIN]}`)
      .expect(200);

    expect(response.body).toMatchObject({
      email: 'admin@smartteacher.dev',
      role: Role.SCHOOL_ADMIN,
      school: {
        name: 'Demo School',
        slug: 'demo-school',
        status: SchoolStatus.ACTIVE,
      },
    });
    expect(response.body.schoolId).toEqual(expect.any(String));
  });

  it('returns a null school for SUPER_ADMIN, who belongs to no tenant', async () => {
    const response = await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', `Bearer ${tokens[Role.SUPER_ADMIN]}`)
      .expect(200);

    expect(response.body.schoolId).toBeNull();
    expect(response.body.school).toBeNull();
  });

  it('never leaks credential material', async () => {
    const response = await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', `Bearer ${tokens[Role.TEACHER]}`)
      .expect(200);

    expect(Object.keys(response.body).sort()).toEqual([
      'email',
      'enrollment',
      'enrollments',
      'id',
      'name',
      'role',
      'school',
      'schoolId',
    ]);
  });
});
