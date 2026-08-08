import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { MailService } from '../src/mail/mail.service';
import { createE2eApp } from './utils/e2e-app';

const mailService = {
  sendUserInvite: jest.fn().mockResolvedValue(undefined),
  sendPasswordReset: jest.fn().mockResolvedValue(undefined),
  sendSchoolAdminWelcome: jest.fn().mockResolvedValue(undefined),
};

describe('Schools + tenant provisioning (e2e)', () => {
  let app: INestApplication;
  let superAdminToken: string;
  let schoolAdminToken: string;
  const suffix = Date.now();

  async function login(email: string, password: string, schoolSlug?: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password, schoolSlug })
      .expect(200);
    return response.body.accessToken;
  }

  beforeAll(async () => {
    app = await createE2eApp({
      overrideProviders: (builder) => builder.overrideProvider(MailService).useValue(mailService),
    });

    superAdminToken = await login('superadmin@smartteacher.dev', 'Passw0rd!');
    schoolAdminToken = await login('admin@smartteacher.dev', 'Passw0rd!', 'demo-school');
  });

  afterAll(async () => {
    await app.close();
  });

  it('lets SUPER_ADMIN provision a school', async () => {
    const response = await request(app.getHttpServer())
      .post('/admin/schools')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        name: 'Provisioned High',
        slug: `provisioned-${suffix}`,
        academicYear: '2025-2026',
        adminEmail: `head-${suffix}@example.com`,
        adminName: 'Head Teacher',
      })
      .expect(201);

    expect(response.body.slug).toBe(`provisioned-${suffix}`);
    expect(response.body.status).toBe('ACTIVE');
  });

  it('provisions a school with an initial password and no invite, and the admin can log in immediately', async () => {
    const slug = `password-set-${suffix}`;
    const email = `head-pwd-${suffix}@example.com`;

    const response = await request(app.getHttpServer())
      .post('/admin/schools')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        name: 'Password Set High',
        slug,
        academicYear: '2025-2026',
        adminEmail: email,
        adminName: 'Head Teacher',
        adminPassword: 'Passw0rd!',
        sendInvite: false,
      })
      .expect(201);

    expect(response.body.slug).toBe(slug);

    await login(email, 'Passw0rd!', slug);
  });

  it('rejects provisioning with neither a password nor an invite', async () => {
    await request(app.getHttpServer())
      .post('/admin/schools')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        name: 'No Access High',
        slug: `no-access-${suffix}`,
        academicYear: '2025-2026',
        adminEmail: `no-access-${suffix}@example.com`,
        adminName: 'Head Teacher',
        sendInvite: false,
      })
      .expect(400);
  });

  it('lets SUPER_ADMIN list schools with pagination metadata', async () => {
    const response = await request(app.getHttpServer())
      .get('/admin/schools?page=1&limit=20')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .expect(200);

    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.meta).toEqual(
      expect.objectContaining({ page: 1, limit: 20, total: expect.any(Number) }),
    );
  });

  it('rejects a duplicate slug with 409', async () => {
    const payload = {
      name: 'Dup',
      slug: `dup-${suffix}`,
      academicYear: '2025-2026',
      adminEmail: `dup-${suffix}@example.com`,
      adminName: 'Dup Admin',
    };

    await request(app.getHttpServer())
      .post('/admin/schools')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send(payload)
      .expect(201);

    await request(app.getHttpServer())
      .post('/admin/schools')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send(payload)
      .expect(409);
  });

  it('allows the same admin email across different schools', async () => {
    const sharedEmail = `shared-${suffix}@example.com`;

    await request(app.getHttpServer())
      .post('/admin/schools')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        name: 'Shared A',
        slug: `shared-a-${suffix}`,
        academicYear: '2025-2026',
        adminEmail: sharedEmail,
        adminName: 'Shared Admin',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/admin/schools')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        name: 'Shared B',
        slug: `shared-b-${suffix}`,
        academicYear: '2025-2026',
        adminEmail: sharedEmail,
        adminName: 'Shared Admin',
      })
      .expect(201);
  });

  it('forbids SCHOOL_ADMIN from reaching admin/schools', async () => {
    await request(app.getHttpServer())
      .get('/admin/schools')
      .set('Authorization', `Bearer ${schoolAdminToken}`)
      .expect(403);
  });

  it('rejects unauthenticated access to admin/schools', async () => {
    await request(app.getHttpServer()).get('/admin/schools').expect(401);
  });

  it('blocks a tenant user at login once its school is suspended, then restores on reactivation', async () => {
    const list = await request(app.getHttpServer())
      .get('/admin/schools?limit=100')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .expect(200);

    const demo = list.body.data.find((school: { slug: string }) => school.slug === 'demo-school');
    expect(demo).toBeDefined();

    await request(app.getHttpServer())
      .patch(`/admin/schools/${demo.id}`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ status: 'SUSPENDED' })
      .expect(200);

    const blocked = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@smartteacher.dev', password: 'Passw0rd!', schoolSlug: 'demo-school' })
      .expect(403);
    expect(blocked.body.message).toMatch(/suspended/i);

    // Restore so the shared seed tenant stays usable for other suites.
    await request(app.getHttpServer())
      .patch(`/admin/schools/${demo.id}`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ status: 'ACTIVE' })
      .expect(200);

    await login('admin@smartteacher.dev', 'Passw0rd!', 'demo-school');
  });
});
