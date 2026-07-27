import { INestApplication, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { DiscoveryModule, DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import request from 'supertest';
import { ROLES_KEY } from '../src/common/decorators/roles.decorator';
import { IS_PUBLIC_KEY } from '../src/common/decorators/public.decorator';
import { createE2eApp } from './utils/e2e-app';
import { loginAllRoles } from './utils/login';

const ALL_ROLES = Object.values(Role);
// Well-formed but nonexistent — Prisma's String id column accepts any string, so this
// only needs to look plausible; it must never match a seeded or test-created row.
const MISSING_ID = 'missing-00000000000000000000000';

interface DiscoveredRoute {
  key: string;
  roles: Role[] | undefined;
  isPublic: boolean;
}

function joinPath(base: string, sub: string): string {
  const combined = `/${base}/${sub}`.replace(/\/{2,}/g, '/');
  return combined.length > 1 && combined.endsWith('/') ? combined.slice(0, -1) : combined;
}

// Reads route declarations from Nest's own metadata (DiscoveryService + Reflector)
// rather than the express router stack, because that's the only way to also read back
// the @Roles/@Public metadata — which is what makes an "undeclared route" detectable.
function discoverRoutes(app: INestApplication): DiscoveredRoute[] {
  const discovery = app.get(DiscoveryService);
  const scanner = app.get(MetadataScanner);
  const reflector = app.get(Reflector);
  const routes: DiscoveredRoute[] = [];

  for (const wrapper of discovery.getControllers()) {
    const metatype = wrapper.metatype;
    if (typeof metatype !== 'function') {
      continue;
    }
    const basePath = (Reflect.getMetadata(PATH_METADATA, metatype) as string | undefined) ?? '';
    const prototype = metatype.prototype as Record<string, () => unknown>;

    for (const name of scanner.getAllMethodNames(prototype)) {
      const handler = prototype[name];
      const subPath = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined;
      const verb = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
      if (subPath === undefined || verb === undefined) {
        continue; // not a route handler
      }

      routes.push({
        key: `${RequestMethod[verb]} ${joinPath(basePath, subPath)}`,
        roles: reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [handler, metatype]),
        isPublic: reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [handler, metatype]) ?? false,
      });
    }
  }

  return routes;
}

type Access = 'public' | { allow: Role[] };

interface MatrixRow {
  key: string;
  request: { method: 'get' | 'post' | 'patch' | 'delete'; path: string; body?: Record<string, unknown> };
  access: Access;
}

// The full route table for F-06: every route in the app, its expected access, and the
// request used to exercise it. The route-declaration tests below fail loudly if a route
// is added, removed, or re-scoped without this table being kept in sync.
const MATRIX: MatrixRow[] = [
  { key: 'GET /health', request: { method: 'get', path: '/health' }, access: 'public' },
  { key: 'POST /auth/login', request: { method: 'post', path: '/auth/login' }, access: 'public' },
  { key: 'POST /auth/refresh', request: { method: 'post', path: '/auth/refresh' }, access: 'public' },
  { key: 'POST /auth/set-password', request: { method: 'post', path: '/auth/set-password' }, access: 'public' },
  {
    key: 'POST /auth/forgot-password',
    request: { method: 'post', path: '/auth/forgot-password' },
    access: 'public',
  },
  {
    key: 'POST /auth/reset-password',
    request: { method: 'post', path: '/auth/reset-password' },
    access: 'public',
  },
  {
    key: 'POST /auth/logout',
    request: { method: 'post', path: '/auth/logout', body: {} },
    access: { allow: ALL_ROLES },
  },
  { key: 'GET /users/me', request: { method: 'get', path: '/users/me' }, access: { allow: ALL_ROLES } },
  {
    key: 'GET /users/:id',
    request: { method: 'get', path: `/users/${MISSING_ID}` },
    access: { allow: ALL_ROLES },
  },
  {
    key: 'POST /users/:id/resend-invite',
    request: { method: 'post', path: `/users/${MISSING_ID}/resend-invite` },
    access: { allow: [Role.SUPER_ADMIN, Role.SCHOOL_ADMIN] },
  },
  {
    key: 'GET /admin/users',
    request: { method: 'get', path: '/admin/users' },
    access: { allow: [Role.SCHOOL_ADMIN] },
  },
  {
    key: 'GET /admin/users/:id',
    request: { method: 'get', path: `/admin/users/${MISSING_ID}` },
    access: { allow: [Role.SCHOOL_ADMIN] },
  },
  {
    key: 'POST /admin/users',
    request: { method: 'post', path: '/admin/users', body: {} },
    access: { allow: [Role.SCHOOL_ADMIN] },
  },
  {
    key: 'GET /admin/stats',
    request: { method: 'get', path: '/admin/stats' },
    access: { allow: [Role.SCHOOL_ADMIN] },
  },
  {
    key: 'GET /admin/schools',
    request: { method: 'get', path: '/admin/schools' },
    access: { allow: [Role.SUPER_ADMIN] },
  },
  {
    key: 'POST /admin/schools',
    request: { method: 'post', path: '/admin/schools', body: {} },
    access: { allow: [Role.SUPER_ADMIN] },
  },
  {
    key: 'PATCH /admin/schools/:id',
    request: { method: 'patch', path: `/admin/schools/${MISSING_ID}`, body: {} },
    access: { allow: [Role.SUPER_ADMIN] },
  },

  // Platform content taxonomy — SUPER_ADMIN only.
  {
    key: 'GET /admin/grade-levels',
    request: { method: 'get', path: '/admin/grade-levels' },
    access: { allow: [Role.SUPER_ADMIN] },
  },
  {
    key: 'POST /admin/grade-levels',
    request: { method: 'post', path: '/admin/grade-levels', body: {} },
    access: { allow: [Role.SUPER_ADMIN] },
  },
  {
    key: 'GET /admin/subjects',
    request: { method: 'get', path: '/admin/subjects' },
    access: { allow: [Role.SUPER_ADMIN] },
  },
  {
    key: 'POST /admin/subjects',
    request: { method: 'post', path: '/admin/subjects', body: {} },
    access: { allow: [Role.SUPER_ADMIN] },
  },
  // A 500 here would mean SubjectsAdminController's @BypassTenantScope is missing:
  // retiring counts SchoolContentEntitlement rows, which is tenant-scoped, and
  // SUPER_ADMIN has no schoolId.
  {
    key: 'PATCH /admin/subjects/:id',
    request: { method: 'patch', path: `/admin/subjects/${MISSING_ID}`, body: {} },
    access: { allow: [Role.SUPER_ADMIN] },
  },

  // The canonical subject list a school selects from (F-37). Read-only, and the one
  // taxonomy route that is not SUPER_ADMIN-only — a School Admin cannot build a
  // timetable against subjects it cannot see.
  {
    key: 'GET /subjects',
    request: { method: 'get', path: '/subjects' },
    access: { allow: ALL_ROLES },
  },

  // Video library management — SUPER_ADMIN only.
  {
    key: 'GET /admin/videos',
    request: { method: 'get', path: '/admin/videos' },
    access: { allow: [Role.SUPER_ADMIN] },
  },
  {
    key: 'POST /admin/videos',
    request: { method: 'post', path: '/admin/videos', body: {} },
    access: { allow: [Role.SUPER_ADMIN] },
  },

  // Entitlement grants — SUPER_ADMIN only. A 500 on any of these would mean the
  // controller's @BypassTenantScope is missing: SchoolContentEntitlement is
  // tenant-scoped and SUPER_ADMIN has no schoolId.
  {
    key: 'GET /admin/schools/:schoolId/entitlements',
    request: { method: 'get', path: `/admin/schools/${MISSING_ID}/entitlements` },
    access: { allow: [Role.SUPER_ADMIN] },
  },
  {
    key: 'POST /admin/schools/:schoolId/entitlements',
    request: { method: 'post', path: `/admin/schools/${MISSING_ID}/entitlements`, body: {} },
    access: { allow: [Role.SUPER_ADMIN] },
  },
  {
    key: 'DELETE /admin/schools/:schoolId/entitlements/:id',
    request: { method: 'delete', path: `/admin/schools/${MISSING_ID}/entitlements/${MISSING_ID}` },
    access: { allow: [Role.SUPER_ADMIN] },
  },

  // The school-facing library. Per the F-06 capability table, "watch entitled videos"
  // is a TEACHER/STUDENT capability — SCHOOL_ADMIN and SUPER_ADMIN are not granted it.
  {
    key: 'GET /videos',
    request: { method: 'get', path: '/videos' },
    access: { allow: [Role.TEACHER, Role.STUDENT] },
  },
  {
    key: 'GET /videos/:id',
    request: { method: 'get', path: `/videos/${MISSING_ID}` },
    access: { allow: [Role.TEACHER, Role.STUDENT] },
  },
];

// F-06 acceptance criterion: "School Admins receive 403 on all video-content and
// entitlement endpoints (those are Super Admin only)."
const CONTENT_AND_ENTITLEMENT_PATHS = [
  '/videos',
  '/admin/videos',
  '/admin/grade-levels',
  '/admin/subjects',
  '/entitlements',
];

function pathOf(key: string): string {
  return key.slice(key.indexOf(' ') + 1);
}

function send(app: INestApplication, req: MatrixRow['request'], token?: string) {
  const r = request(app.getHttpServer())[req.method](req.path);
  const authed = token ? r.set('Authorization', `Bearer ${token}`) : r;
  return req.body !== undefined ? authed.send(req.body) : authed;
}

describe('RBAC matrix (e2e)', () => {
  let app: INestApplication;
  let tokens: Record<Role, string>;
  let discovered: DiscoveredRoute[];

  beforeAll(async () => {
    app = await createE2eApp({ imports: [DiscoveryModule] });
    tokens = await loginAllRoles(app);
    discovered = discoverRoutes(app);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('route declarations', () => {
    it('declares an authorization rule on every route — an undeclared route is a bug, not an open route', () => {
      const undeclared = discovered.filter((r) => !r.isPublic && (!r.roles || r.roles.length === 0));
      expect(undeclared.map((r) => r.key)).toEqual([]);
    });

    it('has every route listed in the RBAC matrix (symmetric diff: catches both a new route and a stale row)', () => {
      expect(discovered.map((r) => r.key).sort()).toEqual(MATRIX.map((r) => r.key).sort());
    });

    it('matches the matrix table to the decorators actually on the handlers', () => {
      for (const route of discovered) {
        const row = MATRIX.find((r) => r.key === route.key);
        expect(row).toBeDefined();
        if (row?.access === 'public') {
          expect(route.isPublic).toBe(true);
        } else if (row) {
          expect([...(route.roles ?? [])].sort()).toEqual([...row.access.allow].sort());
        }
      }
    });
  });

  const gatedRows = MATRIX.filter(
    (row): row is MatrixRow & { access: { allow: Role[] } } => row.access !== 'public',
  );

  // The two role-wide acceptance criteria, asserted over the whole table rather than
  // route by route, so a new content or admin route that grants the wrong role fails
  // here without anyone remembering to add a case. The declaration tests above already
  // prove MATRIX matches the decorators actually on the handlers, so asserting against
  // the table is equivalent to asserting against the app — and the per-row HTTP tests
  // below independently confirm the 403.
  describe('acceptance criteria', () => {
    it('denies SCHOOL_ADMIN every video-content and entitlement endpoint', () => {
      const contentRows = gatedRows.filter((row) =>
        CONTENT_AND_ENTITLEMENT_PATHS.some((path) => pathOf(row.key).includes(path)),
      );

      // Guards against the filter silently matching nothing and passing vacuously.
      expect(contentRows.length).toBeGreaterThanOrEqual(11);
      expect(
        contentRows.filter((row) => row.access.allow.includes(Role.SCHOOL_ADMIN)).map((r) => r.key),
      ).toEqual([]);
    });

    it('denies TEACHER and STUDENT every admin endpoint', () => {
      const adminRows = gatedRows.filter((row) => pathOf(row.key).startsWith('/admin/'));

      expect(adminRows.length).toBeGreaterThanOrEqual(13);
      expect(
        adminRows
          .filter(
            (row) =>
              row.access.allow.includes(Role.TEACHER) || row.access.allow.includes(Role.STUDENT),
          )
          .map((r) => r.key),
      ).toEqual([]);
    });
  });

  describe.each(gatedRows)('$key', (row) => {
    it.each(ALL_ROLES)('role %s', async (role) => {
      const res = await send(app, row.request, tokens[role]);
      // Assert the authorization outcome only: an allowed caller may still get
      // 400/404/409 from validation or a nonexistent id. 401/403 would mean the grant
      // is missing; a 5xx usually means the role was let past RolesGuard straight into
      // a tenant-context misconfiguration (e.g. a SUPER_ADMIN route missing
      // @BypassTenantScope) — that is a bug this test must catch, not tolerate.
      if (row.access.allow.includes(role)) {
        expect([401, 403]).not.toContain(res.status);
        expect(res.status).toBeLessThan(500);
      } else {
        expect(res.status).toBe(403);
      }
    });

    it('401s with no token', async () => {
      const res = await send(app, row.request);
      expect(res.status).toBe(401);
    });
  });
});
