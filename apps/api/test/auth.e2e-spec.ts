import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { INVALID_CREDENTIALS_MESSAGE } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantContextService } from '../src/tenancy/tenant-context.service';

describe('Auth + RBAC (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantContext: TenantContextService;
  let schoolAdminAccessToken: string;
  let teacherAccessToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    prisma = app.get(PrismaService);
    tenantContext = app.get(TenantContextService);
  });

  afterAll(async () => {
    // Don't leave this spec's failed-login rows around to affect other specs'
    // per-IP lockout counters on a later run.
    await tenantContext.runWithSystemBypass(() =>
      prisma.loginAttempt.deleteMany({
        where: { email: { in: ['demo-school:nobody-here@smartteacher.dev', 'demo-school:admin@smartteacher.dev'] } },
      }),
    );
    await app.close();
  });

  it('logs in the seeded school admin user', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@smartteacher.dev', password: 'Passw0rd!', schoolSlug: 'demo-school' })
      .expect(200);

    expect(response.body.accessToken).toEqual(expect.any(String));
    expect(response.body.refreshToken).toEqual(expect.any(String));
    expect(Object.keys(response.body).sort()).toEqual(['accessToken', 'refreshToken']);
    schoolAdminAccessToken = response.body.accessToken;
  });

  it('logs in the seeded teacher user', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'teacher@smartteacher.dev', password: 'Passw0rd!', schoolSlug: 'demo-school' })
      .expect(200);

    teacherAccessToken = response.body.accessToken;
  });

  it('allows SCHOOL_ADMIN to list users via GET /admin/users', async () => {
    await request(app.getHttpServer())
      .get('/admin/users')
      .set('Authorization', `Bearer ${schoolAdminAccessToken}`)
      .expect(200);
  });

  it('forbids TEACHER from GET /admin/users', async () => {
    await request(app.getHttpServer())
      .get('/admin/users')
      .set('Authorization', `Bearer ${teacherAccessToken}`)
      .expect(403);
  });

  it('rejects GET /users/me with no token', async () => {
    await request(app.getHttpServer()).get('/users/me').expect(401);
  });

  it('gives an unknown email and a wrong password the exact same generic message', async () => {
    const unknownEmail = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'nobody-here@smartteacher.dev', password: 'Passw0rd!', schoolSlug: 'demo-school' })
      .expect(401);

    const wrongPassword = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@smartteacher.dev', password: 'totally-wrong', schoolSlug: 'demo-school' })
      .expect(401);

    expect(unknownEmail.body.message).toBe(INVALID_CREDENTIALS_MESSAGE);
    expect(wrongPassword.body.message).toBe(INVALID_CREDENTIALS_MESSAGE);
  });
});
