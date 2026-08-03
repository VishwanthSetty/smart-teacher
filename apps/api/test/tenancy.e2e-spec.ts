import { INestApplication, NotFoundException } from '@nestjs/common';
import { Role, School, UserStatus, VideoStatus } from '@prisma/client';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  MissingTenantContextError,
  TenantMismatchError,
  UnsupportedTenantNestedOperationError,
} from '../src/prisma/tenant-guard.errors';
import { TenantContextService } from '../src/tenancy/tenant-context.service';
import { VideosService } from '../src/videos/videos.service';
import type { AuthenticatedUser } from '../src/auth/types/authenticated-user.interface';
import { createE2eApp } from './utils/e2e-app';
import { login, SEED_PASSWORD } from './utils/login';

describe('Tenant isolation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantContext: TenantContextService;
  let videos: VideosService;
  let adminAToken: string;
  let ownUserId: string;
  let schoolBUserId: string;
  let schoolA: School;
  let schoolB: School;

  // Runs `fn` as a SCHOOL_ADMIN of the given school, exactly as an authenticated request
  // would: the tenant context is populated and no bypass is in play.
  function asTenant<T>(school: School, fn: () => Promise<T>): Promise<T> {
    return tenantContext.runAs(school.id, false, fn);
  }

  function actorFor(school: School, userId: string): AuthenticatedUser {
    return {
      sub: userId,
      email: 'admin@smartteacher.dev',
      name: 'Ada Admin',
      role: Role.SCHOOL_ADMIN,
      schoolId: school.id,
    };
  }

  beforeAll(async () => {
    app = await createE2eApp();

    prisma = app.get(PrismaService);
    tenantContext = app.get(TenantContextService);
    videos = app.get(VideosService);

    adminAToken = await login(app, 'admin@smartteacher.dev', SEED_PASSWORD, 'demo-school');
    const adminBToken = await login(app, 'admin-b@smartteacher.dev', SEED_PASSWORD, 'demo-school-b');

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

    schoolA = await prisma.school.findUniqueOrThrow({ where: { slug: 'demo-school' } });
    schoolB = await prisma.school.findUniqueOrThrow({ where: { slug: 'demo-school-b' } });
  });

  afterAll(async () => {
    await app.close();
  });

  it("only lists users belonging to the caller's own school", async () => {
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

  it("returns 200 for a user in the caller's own school", async () => {
    await request(app.getHttpServer())
      .get(`/admin/users/${ownUserId}`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(200);
  });

  it("rejects a write carrying another tenant's schoolId instead of silently overwriting it", async () => {
    await expect(
      asTenant(schoolA, () =>
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

  it("auto-stamps the caller's own schoolId on a create that omits it", async () => {
    const email = `stamped-${Date.now()}@example.com`;

    const created = await asTenant(schoolA, () =>
      prisma.user.create({ data: { email, name: 'Stamped User' } }),
    );

    expect(created.schoolId).toBe(schoolA.id);

    await asTenant(schoolA, () => prisma.user.delete({ where: { id: created.id } }));
  });

  it('fails closed when a tenant-scoped model is queried with no tenant context', async () => {
    await expect(prisma.user.findMany()).rejects.toBeInstanceOf(MissingTenantContextError);
  });

  // F-02 acceptance criterion 2.
  describe('bulk import', () => {
    it("rejects the whole batch when any row carries another school's schoolId, writing nothing", async () => {
      const marker = `bulk-reject-${Date.now()}`;

      await expect(
        asTenant(schoolA, () =>
          prisma.user.createMany({
            data: [
              { email: `${marker}-1@example.com`, name: 'Row One' },
              { email: `${marker}-2@example.com`, name: 'Row Two', schoolId: schoolB.id },
            ],
          }),
        ),
      ).rejects.toBeInstanceOf(TenantMismatchError);

      // A partial write would be worse than a failed one: assert nothing landed anywhere,
      // in either tenant, before the guard threw.
      const leaked = await tenantContext.runWithSystemBypass(() =>
        prisma.user.findMany({ where: { email: { startsWith: marker } } }),
      );
      expect(leaked).toEqual([]);
    });

    it("stamps the importing school on every row when schoolId is omitted", async () => {
      const marker = `bulk-stamp-${Date.now()}`;

      await asTenant(schoolA, () =>
        prisma.user.createMany({
          data: [
            { email: `${marker}-1@example.com`, name: 'Row One' },
            { email: `${marker}-2@example.com`, name: 'Row Two' },
          ],
        }),
      );

      const created = await tenantContext.runWithSystemBypass(() =>
        prisma.user.findMany({ where: { email: { startsWith: marker } } }),
      );

      expect(created).toHaveLength(2);
      expect(created.every((user) => user.schoolId === schoolA.id)).toBe(true);

      await tenantContext.runWithSystemBypass(() =>
        prisma.user.deleteMany({ where: { email: { startsWith: marker } } }),
      );
    });
  });

  // Prisma's extension hook only fires for the root model, so these shapes would sail
  // straight past the guard without the nested walkers.
  describe('nested relations', () => {
    it("does not hand back another school's users through a relation include", async () => {
      const school = await asTenant(schoolA, () =>
        prisma.school.findUnique({ where: { id: schoolB.id }, include: { users: true } }),
      );

      // The School row itself is platform data and still resolves; its users must not.
      expect(school?.id).toBe(schoolB.id);
      expect(school?.users).toEqual([]);
    });

    it("still returns the caller's own users through the same include", async () => {
      const school = await asTenant(schoolA, () =>
        prisma.school.findUnique({ where: { id: schoolA.id }, include: { users: true } }),
      );

      expect(school?.users.length).toBeGreaterThan(0);
      expect(school?.users.every((user) => user.schoolId === schoolA.id)).toBe(true);
    });

    it('refuses a nested create that would land in whichever school the parent row belongs to', async () => {
      const email = `nested-create-${Date.now()}@example.com`;

      await expect(
        asTenant(schoolA, () =>
          prisma.school.update({
            where: { id: schoolB.id },
            data: { users: { create: [{ email, name: 'Nested User', status: UserStatus.PENDING }] } },
          }),
        ),
      ).rejects.toBeInstanceOf(UnsupportedTenantNestedOperationError);

      const leaked = await tenantContext.runWithSystemBypass(() => prisma.user.findFirst({ where: { email } }));
      expect(leaked).toBeNull();
    });

    it('refuses a nested connect that would move a user into another tenant', async () => {
      await expect(
        asTenant(schoolA, () =>
          prisma.school.update({
            where: { id: schoolA.id },
            data: { users: { connect: { id: schoolBUserId } } },
          }),
        ),
      ).rejects.toBeInstanceOf(UnsupportedTenantNestedOperationError);

      const untouched = await tenantContext.runWithSystemBypass(() =>
        prisma.user.findUniqueOrThrow({ where: { id: schoolBUserId } }),
      );
      expect(untouched.schoolId).toBe(schoolB.id);
    });

    it('refuses a to-one include it cannot filter rather than returning it unscoped', async () => {
      await expect(
        asTenant(schoolA, () => prisma.refreshToken.findMany({ include: { user: true } })),
      ).rejects.toBeInstanceOf(UnsupportedTenantNestedOperationError);
    });
  });

  // F-02 acceptance criterion 3. GradeLevel/Subject/Video are platform-global and carry
  // no schoolId, so tenant scoping cannot gate them — the entitlement check must.
  describe('platform content entitlements', () => {
    let entitledVideoId: string;
    let unentitledVideoId: string;

    beforeAll(async () => {
      const entitlement = await asTenant(schoolA, () =>
        prisma.schoolContentEntitlement.findFirstOrThrow({}),
      );

      // status: READY on both is load-bearing, not incidental. Every school-facing read
      // narrows to READY on top of the entitlement check, so picking an in-flight ingest
      // row here would make "entitled" 404 for the wrong reason and "unentitled" pass
      // vacuously — the status filter would be doing work the entitlement check is
      // supposed to be proving. Any ingest row left in the database by another suite (or
      // by hand) is enough to select one, since findFirstOrThrow imposes no order.
      const entitled = await tenantContext.runWithSystemBypass(() =>
        prisma.video.findFirstOrThrow({
          where: {
            gradeLevelId: entitlement.gradeLevelId,
            subjectId: entitlement.subjectId,
            status: VideoStatus.READY,
          },
        }),
      );
      const unentitled = await tenantContext.runWithSystemBypass(() =>
        prisma.video.findFirstOrThrow({
          where: { NOT: { subjectId: entitlement.subjectId }, status: VideoStatus.READY },
        }),
      );

      entitledVideoId = entitled.id;
      unentitledVideoId = unentitled.id;
    });

    it('lets a school read a video for a (grade, subject) it is entitled to', async () => {
      const video = await asTenant(schoolA, () =>
        videos.findOneVisibleTo(entitledVideoId, actorFor(schoolA, ownUserId)),
      );

      expect(video.id).toBe(entitledVideoId);
    });

    it('returns 404, not 403, for a video the school holds no entitlement for', async () => {
      await expect(
        asTenant(schoolA, () => videos.findOneVisibleTo(unentitledVideoId, actorFor(schoolA, ownUserId))),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('hides every video from a school with no entitlements at all', async () => {
      const listed = await asTenant(schoolB, () =>
        videos.findAllVisibleTo(actorFor(schoolB, schoolBUserId)),
      );
      expect(listed).toEqual([]);

      await expect(
        asTenant(schoolB, () => videos.findOneVisibleTo(entitledVideoId, actorFor(schoolB, schoolBUserId))),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('lists only the videos covered by the school\'s entitlements', async () => {
      const listed = await asTenant(schoolA, () => videos.findAllVisibleTo(actorFor(schoolA, ownUserId)));

      expect(listed.map((video) => video.id)).toEqual([entitledVideoId]);
    });

    it("never reveals another school's entitlements", async () => {
      const fromB = await asTenant(schoolB, () => prisma.schoolContentEntitlement.findMany({}));
      expect(fromB).toEqual([]);
    });
  });
});
