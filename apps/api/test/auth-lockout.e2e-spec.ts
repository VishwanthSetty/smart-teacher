import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Role, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantContextService } from '../src/tenancy/tenant-context.service';

const CORRECT_PASSWORD = 'Passw0rd!';
const EMAIL_KEY_PREFIX = 'demo-school';

describe('Login lockout (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantContext: TenantContextService;
  let throwawayId: string;
  let throwawayEmail: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    prisma = app.get(PrismaService);
    tenantContext = app.get(TenantContextService);

    // The per-IP counter is shared with every other spec file hitting this same
    // server; wipe it so unrelated failed attempts elsewhere in the suite can't
    // push this test's own count over the threshold early (or leave it short).
    await tenantContext.runWithSystemBypass(() => prisma.loginAttempt.deleteMany({}));

    throwawayEmail = `lockout-${Date.now()}@example.com`;
    const passwordHash = await bcrypt.hash(CORRECT_PASSWORD, 10);
    const school = await tenantContext.runWithSystemBypass(() =>
      prisma.school.findUniqueOrThrow({ where: { slug: 'demo-school' } }),
    );
    const throwaway = await tenantContext.runWithSystemBypass(() =>
      prisma.user.create({
        data: {
          email: throwawayEmail,
          name: 'Lockout Target',
          role: Role.TEACHER,
          status: UserStatus.ACTIVE,
          passwordHash,
          schoolId: school.id,
        },
      }),
    );
    throwawayId = throwaway.id;
  });

  afterAll(async () => {
    await tenantContext.runWithSystemBypass(() =>
      prisma.loginAttempt.deleteMany({ where: { email: `${EMAIL_KEY_PREFIX}:${throwawayEmail}` } }),
    );
    await tenantContext.runWithSystemBypass(() => prisma.user.delete({ where: { id: throwawayId } }));
    await app.close();
  });

  it('locks out after 20 failed attempts, even with the correct password on the 21st try', async () => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: throwawayEmail, password: 'wrong-password', schoolSlug: 'demo-school' })
        .expect(401);
    }

    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: throwawayEmail, password: CORRECT_PASSWORD, schoolSlug: 'demo-school' })
      .expect(429);

    expect(response.body.message).toMatch(/too many failed login attempts/i);
  }, 30_000);
});
