import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { MissingTenantContextError, TenantMismatchError } from '../src/prisma/tenant-guard.errors';
import { TenantContextService } from '../src/tenancy/tenant-context.service';

describe('Tenant isolation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantContext: TenantContextService;
  let adminAToken: string;
  let ownUserId: string;
  let schoolBUserId: string;

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
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    prisma = app.get(PrismaService);
    tenantContext = app.get(TenantContextService);

    adminAToken = await login('admin@smartteacher.dev', 'Passw0rd!', 'demo-school');
    const adminBToken = await login('admin-b@smartteacher.dev', 'Passw0rd!', 'demo-school-b');

    const meA = await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(200);
    ownUserId = meA.body.id;

    const meB = await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', `Bearer ${adminBToken}`)
      .expect(200);
    schoolBUserId = meB.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('only lists users belonging to the caller\'s own school', async () => {
    const response = await request(app.getHttpServer())
      .get('/admin/users')
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(200);

    const ids = (response.body as Array<{ id: string }>).map((user) => user.id);
    expect(ids).toContain(ownUserId);
    expect(ids).not.toContain(schoolBUserId);
  });

  it('returns 404, not 403, when School A requests a School B user by id', async () => {
    await request(app.getHttpServer())
      .get(`/admin/users/${schoolBUserId}`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(404);
  });

  it('returns 200 for a user in the caller\'s own school', async () => {
    await request(app.getHttpServer())
      .get(`/admin/users/${ownUserId}`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(200);
  });

  it('rejects a write carrying another tenant\'s schoolId instead of silently overwriting it', async () => {
    const schoolA = await prisma.school.findUniqueOrThrow({ where: { slug: 'demo-school' } });
    const schoolB = await prisma.school.findUniqueOrThrow({ where: { slug: 'demo-school-b' } });

    await expect(
      tenantContext.runAs(schoolA.id, false, () =>
        prisma.user.create({
          data: {
            email: `mismatch-${Date.now()}@example.com`,
            name: 'Cross Tenant Import',
            schoolId: schoolB.id,
          },
        }),
      ),
    ).rejects.toBeInstanceOf(TenantMismatchError);
  });

  it('auto-stamps the caller\'s own schoolId on a create that omits it', async () => {
    const schoolA = await prisma.school.findUniqueOrThrow({ where: { slug: 'demo-school' } });
    const email = `stamped-${Date.now()}@example.com`;

    const created = await tenantContext.runAs(schoolA.id, false, () =>
      prisma.user.create({ data: { email, name: 'Stamped User' } }),
    );

    expect(created.schoolId).toBe(schoolA.id);

    await tenantContext.runAs(schoolA.id, false, () => prisma.user.delete({ where: { id: created.id } }));
  });

  it('fails closed when a tenant-scoped model is queried with no tenant context', async () => {
    await expect(prisma.user.findMany()).rejects.toBeInstanceOf(MissingTenantContextError);
  });
});
