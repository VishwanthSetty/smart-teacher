import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { MailService, UserInvite } from '../src/mail/mail.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantContextService } from '../src/tenancy/tenant-context.service';

describe('Invite & first-login password set (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantContext: TenantContextService;
  let schoolAdminToken: string;
  let teacherToken: string;
  let adminBToken: string;
  let superAdminToken: string;

  const suffix = Date.now();
  const sentInvites = new Map<string, UserInvite>();
  const emailFor = (label: string) => `invite-e2e-${label}-${suffix}@example.com`;

  async function login(email: string, password: string, schoolSlug?: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password, schoolSlug })
      .expect(200);
    return response.body.accessToken;
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MailService)
      .useValue({
        sendUserInvite: jest.fn(async (invite: UserInvite) => {
          sentInvites.set(invite.email, invite);
        }),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    prisma = app.get(PrismaService);
    tenantContext = app.get(TenantContextService);

    schoolAdminToken = await login('admin@smartteacher.dev', 'Passw0rd!', 'demo-school');
    teacherToken = await login('teacher@smartteacher.dev', 'Passw0rd!', 'demo-school');
    adminBToken = await login('admin-b@smartteacher.dev', 'Passw0rd!', 'demo-school-b');
    superAdminToken = await login('superadmin@smartteacher.dev', 'Passw0rd!');
  });

  afterAll(async () => {
    await tenantContext.runWithSystemBypass(async () => {
      await prisma.user.deleteMany({ where: { email: { contains: `-${suffix}@example.com` } } });
      await prisma.school.deleteMany({ where: { slug: { contains: `invite-e2e-${suffix}` } } });
    });
    await app.close();
  });

  it('creates a PENDING teacher and emails an invite, never exposing password/hash fields', async () => {
    const email = emailFor('teacher');

    const response = await request(app.getHttpServer())
      .post('/admin/users')
      .set('Authorization', `Bearer ${schoolAdminToken}`)
      .send({ email, name: 'Invite Teacher', role: 'TEACHER' })
      .expect(201);

    expect(response.body).toEqual(
      expect.objectContaining({ email, status: 'PENDING', activatedAt: null }),
    );
    expect(response.body.passwordHash).toBeUndefined();
    expect(response.body.inviteTokenHash).toBeUndefined();
    expect(sentInvites.has(email)).toBe(true);
  });

  it('forbids TEACHER from creating users', async () => {
    await request(app.getHttpServer())
      .post('/admin/users')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ email: emailFor('forbidden'), name: 'Nope', role: 'TEACHER' })
      .expect(403);
  });

  it('rejects a duplicate email within the same school with 409', async () => {
    const email = emailFor('dup');

    await request(app.getHttpServer())
      .post('/admin/users')
      .set('Authorization', `Bearer ${schoolAdminToken}`)
      .send({ email, name: 'Dup', role: 'TEACHER' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/admin/users')
      .set('Authorization', `Bearer ${schoolAdminToken}`)
      .send({ email, name: 'Dup', role: 'TEACHER' })
      .expect(409);
  });

  it('blocks login for a PENDING user before the invite is redeemed', async () => {
    const email = emailFor('pending-login');
    await request(app.getHttpServer())
      .post('/admin/users')
      .set('Authorization', `Bearer ${schoolAdminToken}`)
      .send({ email, name: 'Pending Login', role: 'TEACHER' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'whatever1', schoolSlug: 'demo-school' })
      .expect(401);
  });

  it('rejects a password under 8 characters', async () => {
    const email = emailFor('short-pw');
    await request(app.getHttpServer())
      .post('/admin/users')
      .set('Authorization', `Bearer ${schoolAdminToken}`)
      .send({ email, name: 'Short Pw', role: 'TEACHER' })
      .expect(201);

    const token = sentInvites.get(email)?.inviteToken;
    await request(app.getHttpServer())
      .post('/auth/set-password')
      .send({ token, password: 'short' })
      .expect(400);
  });

  it('rejects a password equal to the account email', async () => {
    const email = emailFor('same-as-email');
    await request(app.getHttpServer())
      .post('/admin/users')
      .set('Authorization', `Bearer ${schoolAdminToken}`)
      .send({ email, name: 'Same As Email', role: 'TEACHER' })
      .expect(201);

    const token = sentInvites.get(email)?.inviteToken;
    await request(app.getHttpServer())
      .post('/auth/set-password')
      .send({ token, password: email.toUpperCase() })
      .expect(400);
  });

  it('redeems the invite, activates the account, and rejects reuse of the same token', async () => {
    const email = emailFor('happy-path');
    const created = await request(app.getHttpServer())
      .post('/admin/users')
      .set('Authorization', `Bearer ${schoolAdminToken}`)
      .send({ email, name: 'Happy Path', role: 'TEACHER' })
      .expect(201);

    const token = sentInvites.get(email)?.inviteToken;
    expect(token).toEqual(expect.any(String));

    await request(app.getHttpServer())
      .post('/auth/set-password')
      .send({ token, password: 'BrandNewPassw0rd!' })
      .expect(204);

    await login(email, 'BrandNewPassw0rd!', 'demo-school');

    const list = await request(app.getHttpServer())
      .get(`/admin/users/${created.body.id}`)
      .set('Authorization', `Bearer ${schoolAdminToken}`)
      .expect(200);
    expect(list.body.status).toBe('ACTIVE');
    expect(list.body.activatedAt).toEqual(expect.any(String));

    // Old link after activation: invite fields were nulled on redeem, so the
    // same raw token no longer maps to anything.
    await request(app.getHttpServer())
      .post('/auth/set-password')
      .send({ token, password: 'AnotherPassw0rd!' })
      .expect(400);
  });

  it('expires an invite past its 7-day window with 410, not 400', async () => {
    const email = emailFor('expiring');
    await request(app.getHttpServer())
      .post('/admin/users')
      .set('Authorization', `Bearer ${schoolAdminToken}`)
      .send({ email, name: 'Expiring', role: 'TEACHER' })
      .expect(201);

    const token = sentInvites.get(email)?.inviteToken;

    await tenantContext.runWithSystemBypass(async () => {
      const user = await prisma.user.findFirst({ where: { email } });
      if (!user) throw new Error('expiring-user not found');
      await prisma.user.update({
        where: { id: user.id },
        data: { inviteTokenExpiresAt: new Date(Date.now() - 1000) },
      });
    });

    await request(app.getHttpServer())
      .post('/auth/set-password')
      .send({ token, password: 'BrandNewPassw0rd!' })
      .expect(410);
  });

  it('resend invalidates the previous link and issues a new one; only SUPER_ADMIN/SCHOOL_ADMIN may resend', async () => {
    const email = emailFor('resend');
    const created = await request(app.getHttpServer())
      .post('/admin/users')
      .set('Authorization', `Bearer ${schoolAdminToken}`)
      .send({ email, name: 'Resend Me', role: 'TEACHER' })
      .expect(201);

    const firstToken = sentInvites.get(email)?.inviteToken;

    await request(app.getHttpServer())
      .post(`/users/${created.body.id}/resend-invite`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .post(`/users/${created.body.id}/resend-invite`)
      .set('Authorization', `Bearer ${schoolAdminToken}`)
      .expect(204);

    const secondToken = sentInvites.get(email)?.inviteToken;
    expect(secondToken).not.toEqual(firstToken);

    // The invalidated first link now redeems as invalid, not expired.
    await request(app.getHttpServer())
      .post('/auth/set-password')
      .send({ token: firstToken, password: 'BrandNewPassw0rd!' })
      .expect(400);

    await request(app.getHttpServer())
      .post('/auth/set-password')
      .send({ token: secondToken, password: 'BrandNewPassw0rd!' })
      .expect(204);

    // Resending an already-activated user is a conflict, not a silent success.
    await request(app.getHttpServer())
      .post(`/users/${created.body.id}/resend-invite`)
      .set('Authorization', `Bearer ${schoolAdminToken}`)
      .expect(409);
  });

  it('returns 404, not 403, when resending across tenants', async () => {
    const email = emailFor('cross-tenant');
    const created = await request(app.getHttpServer())
      .post('/admin/users')
      .set('Authorization', `Bearer ${schoolAdminToken}`)
      .send({ email, name: 'Cross Tenant', role: 'TEACHER' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/users/${created.body.id}/resend-invite`)
      .set('Authorization', `Bearer ${adminBToken}`)
      .expect(404);
  });

  it('lets SUPER_ADMIN resend a pending school admin\'s invite across tenants', async () => {
    const schoolSlug = `invite-e2e-${suffix}-school`;
    const adminEmail = emailFor('school-admin');

    await request(app.getHttpServer())
      .post('/admin/schools')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        name: 'Invite E2E School',
        slug: schoolSlug,
        academicYear: '2025-2026',
        adminEmail,
        adminName: 'Pending School Admin',
      })
      .expect(201);

    expect(sentInvites.has(adminEmail)).toBe(true);

    const pendingAdminId = await tenantContext.runWithSystemBypass(async () => {
      const user = await prisma.user.findFirst({ where: { email: adminEmail } });
      if (!user) throw new Error('school admin not found');
      return user.id;
    });

    await request(app.getHttpServer())
      .post(`/users/${pendingAdminId}/resend-invite`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .expect(204);
  });
});
