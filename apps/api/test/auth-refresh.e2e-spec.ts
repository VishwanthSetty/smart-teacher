import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Role, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { DISABLED_ACCOUNT_MESSAGE } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantContextService } from '../src/tenancy/tenant-context.service';

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

// Test-only: reads the payload without verifying the signature (the API already
// signs and verifies for real; this just inspects claims to drive assertions).
function decode(token: string): Record<string, unknown> {
  const [, payload] = token.split('.');
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
}

describe('Auth refresh rotation + reuse detection (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantContext: TenantContextService;

  async function login(email: string, password: string, schoolSlug: string): Promise<TokenPair> {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password, schoolSlug })
      .expect(200);
    return response.body as TokenPair;
  }

  function refreshWith(refreshToken: string) {
    return request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Authorization', `Bearer ${refreshToken}`);
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    prisma = app.get(PrismaService);
    tenantContext = app.get(TenantContextService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('rotates the refresh token and carries the same identity claims forward', async () => {
    const first = await login('teacher@smartteacher.dev', 'Passw0rd!', 'demo-school');
    const firstAccess = decode(first.accessToken);

    const response = await refreshWith(first.refreshToken).expect(200);
    const second = response.body as TokenPair;
    const secondAccess = decode(second.accessToken);

    // Access tokens aren't asserted for inequality: two issued for the same user
    // within the same second are byte-identical (deterministic signing, 1s-resolution
    // iat/exp) — that's expected JWT behavior, not something rotation changes.
    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(secondAccess).toMatchObject({
      sub: firstAccess.sub,
      schoolId: firstAccess.schoolId,
      role: firstAccess.role,
    });
  });

  it('tolerates an immediate reuse (benign race) by issuing a sibling token', async () => {
    const first = await login('teacher@smartteacher.dev', 'Passw0rd!', 'demo-school');

    await refreshWith(first.refreshToken).expect(200);
    // Reusing the same (now-rotated) token again right away is a benign race —
    // it must not be treated as theft.
    await refreshWith(first.refreshToken).expect(200);
  });

  it('revokes the whole family when a rotated token is reused outside the grace window', async () => {
    const first = await login('teacher@smartteacher.dev', 'Passw0rd!', 'demo-school');
    const firstPayload = decode(first.refreshToken) as { jti: string; familyId: string };

    const rotateResponse = await refreshWith(first.refreshToken).expect(200);
    const second = rotateResponse.body as TokenPair;

    // Simulate the grace window having elapsed by backdating the used token's
    // revocation timestamp directly.
    await tenantContext.runWithSystemBypass(() =>
      prisma.refreshToken.update({
        where: { id: firstPayload.jti },
        data: { revokedAt: new Date(Date.now() - 60_000) },
      }),
    );

    await refreshWith(first.refreshToken).expect(401);

    const familyTokens = await tenantContext.runWithSystemBypass(() =>
      prisma.refreshToken.findMany({ where: { familyId: firstPayload.familyId } }),
    );
    expect(familyTokens.length).toBeGreaterThan(0);
    expect(familyTokens.every((t) => t.revokedAt !== null)).toBe(true);

    // The token issued by the (now-punished) rotation is dead too.
    await refreshWith(second.refreshToken).expect(401);
  });

  it('keeps sessions independent per login: revoking one family leaves the other refreshable', async () => {
    const sessionA = await login('admin@smartteacher.dev', 'Passw0rd!', 'demo-school');
    const sessionB = await login('admin@smartteacher.dev', 'Passw0rd!', 'demo-school');

    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${sessionA.accessToken}`)
      .send({ refreshToken: sessionA.refreshToken })
      .expect(204);

    await refreshWith(sessionA.refreshToken).expect(401);
    await refreshWith(sessionB.refreshToken).expect(200);
  });

  it('blocks refresh with a distinct message once the account is disabled mid-session', async () => {
    const passwordHash = await bcrypt.hash('Passw0rd!', 10);
    const school = await tenantContext.runWithSystemBypass(() =>
      prisma.school.findUniqueOrThrow({ where: { slug: 'demo-school' } }),
    );
    const throwaway = await tenantContext.runWithSystemBypass(() =>
      prisma.user.create({
        data: {
          email: `disable-me-${Date.now()}@example.com`,
          name: 'Disable Me',
          role: Role.TEACHER,
          status: UserStatus.ACTIVE,
          passwordHash,
          schoolId: school.id,
        },
      }),
    );

    try {
      const session = await login(throwaway.email, 'Passw0rd!', 'demo-school');

      await tenantContext.runWithSystemBypass(() =>
        prisma.user.update({ where: { id: throwaway.id }, data: { status: UserStatus.DISABLED } }),
      );

      const response = await refreshWith(session.refreshToken).expect(403);
      expect(response.body.message).toBe(DISABLED_ACCOUNT_MESSAGE);
    } finally {
      await tenantContext.runWithSystemBypass(() => prisma.user.delete({ where: { id: throwaway.id } }));
    }
  });
});
