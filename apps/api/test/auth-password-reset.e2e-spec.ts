import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { MailService, PasswordReset, UserInvite } from '../src/mail/mail.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantContextService } from '../src/tenancy/tenant-context.service';

describe('Forgot / reset password (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantContext: TenantContextService;

  const suffix = Date.now();
  const sentResets = new Map<string, PasswordReset>();
  const emailFor = (label: string) => `reset-e2e-${label}-${suffix}@example.com`;

  async function createActiveUser(email: string, password: string): Promise<string> {
    return tenantContext.runWithSystemBypass(async () => {
      const bcrypt = await import('bcrypt');
      const school = await prisma.school.findUniqueOrThrow({ where: { slug: 'demo-school' } });
      const user = await prisma.user.create({
        data: {
          email,
          name: 'Reset E2E User',
          role: 'TEACHER',
          status: 'ACTIVE',
          passwordHash: await bcrypt.hash(password, 10),
          schoolId: school.id,
        },
      });
      return user.id;
    });
  }

  async function login(email: string, password: string): Promise<{ accessToken: string; refreshToken: string }> {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password, schoolSlug: 'demo-school' })
      .expect(200);
    return response.body;
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MailService)
      .useValue({
        sendUserInvite: jest.fn(async (_invite: UserInvite) => undefined),
        sendPasswordReset: jest.fn(async (reset: PasswordReset) => {
          sentResets.set(reset.email, reset);
        }),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    prisma = app.get(PrismaService);
    tenantContext = app.get(TenantContextService);
  });

  afterAll(async () => {
    await tenantContext.runWithSystemBypass(async () => {
      await prisma.user.deleteMany({ where: { email: { contains: `-${suffix}@example.com` } } });
      await prisma.loginAttempt.deleteMany({
        where: { OR: [{ email: { contains: String(suffix) } }, { ipAddress: { startsWith: 'reset:' } }] },
      });
    });
    await app.close();
  });

  it('returns byte-identical generic responses for a real and a nonexistent email', async () => {
    const realEmail = emailFor('generic-real');
    await createActiveUser(realEmail, 'Passw0rd!');

    const realResponse = await request(app.getHttpServer())
      .post('/auth/forgot-password')
      .send({ email: realEmail, schoolSlug: 'demo-school' })
      .expect(200);

    const ghostResponse = await request(app.getHttpServer())
      .post('/auth/forgot-password')
      .send({ email: emailFor('generic-ghost'), schoolSlug: 'demo-school' })
      .expect(200);

    expect(realResponse.body).toEqual(ghostResponse.body);
    expect(sentResets.has(realEmail)).toBe(true);
  });

  it('resets the password, kills the pre-reset refresh token, and lets the new password log in', async () => {
    const email = emailFor('happy-path');
    await createActiveUser(email, 'OldPassw0rd!');
    const { refreshToken: preResetRefreshToken } = await login(email, 'OldPassw0rd!');

    await request(app.getHttpServer())
      .post('/auth/forgot-password')
      .send({ email, schoolSlug: 'demo-school' })
      .expect(200);

    const token = sentResets.get(email)?.resetToken;
    expect(token).toEqual(expect.any(String));

    await request(app.getHttpServer())
      .post('/auth/reset-password')
      .send({ token, password: 'BrandNewPassw0rd!' })
      .expect(204);

    // Old password now fails.
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'OldPassw0rd!', schoolSlug: 'demo-school' })
      .expect(401);

    // New password succeeds.
    await login(email, 'BrandNewPassw0rd!');

    // The refresh token issued before the reset is dead.
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Authorization', `Bearer ${preResetRefreshToken}`)
      .expect(401);

    // Replaying the same reset token fails.
    await request(app.getHttpServer())
      .post('/auth/reset-password')
      .send({ token, password: 'AnotherPassw0rd!' })
      .expect(400);
  });

  it('rejects an expired reset token with 410, not 400', async () => {
    const email = emailFor('expiring');
    await createActiveUser(email, 'Passw0rd!');

    await request(app.getHttpServer())
      .post('/auth/forgot-password')
      .send({ email, schoolSlug: 'demo-school' })
      .expect(200);

    const token = sentResets.get(email)?.resetToken;

    await tenantContext.runWithSystemBypass(async () => {
      const user = await prisma.user.findFirst({ where: { email } });
      if (!user) throw new Error('expiring-user not found');
      await prisma.user.update({
        where: { id: user.id },
        data: { resetTokenExpiresAt: new Date(Date.now() - 1000) },
      });
    });

    await request(app.getHttpServer())
      .post('/auth/reset-password')
      .send({ token, password: 'BrandNewPassw0rd!' })
      .expect(410);
  });

  it('rejects an unknown reset token with 400', async () => {
    await request(app.getHttpServer())
      .post('/auth/reset-password')
      .send({ token: 'not-a-real-token', password: 'BrandNewPassw0rd!' })
      .expect(400);
  });

  it('throttles repeated forgot-password requests for the same email', async () => {
    const email = emailFor('throttled');
    await createActiveUser(email, 'Passw0rd!');

    // `trust proxy` is only set in main.ts's bootstrap(), which e2e tests never call
    // (the app is built directly via createNestApplication()), so req.ip is always
    // the real loopback address here regardless of X-Forwarded-For. Every prior
    // forgot-password call in this file therefore shares one IP counter with this
    // test; wipe it first so this test starts from a clean slate, mirroring
    // auth-lockout.e2e-spec.ts's whole-table wipe for the same reason.
    await tenantContext.runWithSystemBypass(() =>
      prisma.loginAttempt.deleteMany({
        where: { OR: [{ email: { startsWith: 'reset:' } }, { ipAddress: { startsWith: 'reset:' } }] },
      }),
    );

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email, schoolSlug: 'demo-school' })
        .expect(200);
    }

    await request(app.getHttpServer())
      .post('/auth/forgot-password')
      .send({ email, schoolSlug: 'demo-school' })
      .expect(429);
  });
});
