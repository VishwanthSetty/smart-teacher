import { INestApplication, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { DiscoveryModule, DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import request from 'supertest';
import { ROLES_KEY } from '../src/common/decorators/roles.decorator';
import { IS_PUBLIC_KEY } from '../src/common/decorators/public.decorator';
import { IS_WORKER_ROUTE_KEY } from '../src/common/decorators/worker-route.decorator';
import { IS_PLAYBACK_TOKEN_ROUTE_KEY } from '../src/common/decorators/playback-token-route.decorator';
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
  // Authenticated by WorkerAuthGuard's HMAC rather than a bearer token — a third
  // authorization category, so "no @Roles" is a declaration here, not an omission.
  isWorker: boolean;
  isPlaybackToken: boolean;
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
        isWorker:
          reflector.getAllAndOverride<boolean>(IS_WORKER_ROUTE_KEY, [handler, metatype]) ?? false,
        isPlaybackToken:
          reflector.getAllAndOverride<boolean>(IS_PLAYBACK_TOKEN_ROUTE_KEY, [handler, metatype]) ?? false,
      });
    }
  }

  return routes;
}

// 'worker' is not "open": the route is authenticated by an HMAC over the raw body, which
// the per-role loop below cannot express. Its auth assertions live in
// transcode-callback.e2e-spec.ts; it is listed here so the symmetric diff still covers it.
type Access = 'public' | 'worker' | 'playback-token' | { allow: Role[] };

interface MatrixRow {
  key: string;
  request: { method: 'get' | 'post' | 'put' | 'patch' | 'delete'; path: string; body?: Record<string, unknown> };
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
  { key: 'GET /auth/invite', request: { method: 'get', path: '/auth/invite?token=invalid' }, access: 'public' },
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
  // The bulk-import routes are tenant-scoped SCHOOL_ADMIN work, so they sit under
  // /teachers rather than /admin — they never cross a tenant boundary.
  {
    key: 'GET /teachers/bulk/template',
    request: { method: 'get', path: '/teachers/bulk/template' },
    access: { allow: [Role.SCHOOL_ADMIN] },
  },
  {
    // Sent as JSON rather than multipart: multer passes a non-multipart body straight
    // through, so the handler sees no file and answers 400 — an authorization pass,
    // which is all this table asserts.
    key: 'POST /teachers/bulk',
    request: { method: 'post', path: '/teachers/bulk', body: {} },
    access: { allow: [Role.SCHOOL_ADMIN] },
  },
  {
    key: 'GET /teachers/bulk/:batchId',
    request: { method: 'get', path: `/teachers/bulk/${MISSING_ID}` },
    access: { allow: [Role.SCHOOL_ADMIN] },
  },
  {
    key: 'POST /teachers/bulk/:batchId/confirm',
    request: { method: 'post', path: `/teachers/bulk/${MISSING_ID}/confirm`, body: {} },
    access: { allow: [Role.SCHOOL_ADMIN] },
  },
  {
    key: 'GET /teachers/bulk/:batchId/errors',
    request: { method: 'get', path: `/teachers/bulk/${MISSING_ID}/errors` },
    access: { allow: [Role.SCHOOL_ADMIN] },
  },
  {
    key: 'POST /teachers',
    request: { method: 'post', path: '/teachers', body: {} },
    access: { allow: [Role.SCHOOL_ADMIN] },
  },
  {
    key: 'GET /teachers/:id/password',
    request: { method: 'get', path: `/teachers/${MISSING_ID}/password` },
    access: { allow: [Role.SCHOOL_ADMIN] },
  },
  {
    key: 'POST /teachers/:id/password',
    request: { method: 'post', path: `/teachers/${MISSING_ID}/password`, body: {} },
    access: { allow: [Role.SCHOOL_ADMIN] },
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
    key: 'GET /admin/platform-stats',
    request: { method: 'get', path: '/admin/platform-stats' },
    access: { allow: [Role.SUPER_ADMIN] },
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
    key: 'GET /admin/schools/:id',
    request: { method: 'get', path: `/admin/schools/${MISSING_ID}` },
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
    key: 'PATCH /admin/grade-levels/:id',
    request: { method: 'patch', path: `/admin/grade-levels/${MISSING_ID}`, body: {} },
    access: { allow: [Role.SUPER_ADMIN] },
  },
  // A 500 here would mean GradeLevelsController's @BypassTenantScope is missing:
  // deleting counts Section and SchoolContentEntitlement rows, both tenant-scoped, and
  // SUPER_ADMIN has no schoolId.
  {
    key: 'DELETE /admin/grade-levels/:id',
    request: { method: 'delete', path: `/admin/grade-levels/${MISSING_ID}` },
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
  // The grade-level list a school selects from when creating a section — same
  // read-only-for-everyone shape as /subjects.
  {
    key: 'GET /grade-levels',
    request: { method: 'get', path: '/grade-levels' },
    access: { allow: ALL_ROLES },
  },

  // Curriculum structure — the configurable hierarchy below the grade/subject spine.
  // Authoring is SUPER_ADMIN only, exactly like the taxonomy it keys off.
  //
  // The schema and content-node controllers touch only platform-global models, so they
  // carry no @BypassTenantScope. CurriculaAdminController does carry it: its detail read
  // reports the entitled-school count and its delete guard refuses while any grant
  // exists, and SchoolContentEntitlement is tenant-scoped while SUPER_ADMIN has no
  // schoolId. A 500 on a /admin/curricula route means that bypass went missing.
  {
    key: 'GET /admin/curriculum-schemas',
    request: { method: 'get', path: '/admin/curriculum-schemas' },
    access: { allow: [Role.SUPER_ADMIN] },
  },
  {
    key: 'GET /admin/curriculum-schemas/:id',
    request: { method: 'get', path: `/admin/curriculum-schemas/${MISSING_ID}` },
    access: { allow: [Role.SUPER_ADMIN] },
  },
  {
    key: 'POST /admin/curriculum-schemas',
    request: { method: 'post', path: '/admin/curriculum-schemas', body: {} },
    access: { allow: [Role.SUPER_ADMIN] },
  },
  {
    key: 'POST /admin/curriculum-schemas/:id/clone',
    request: { method: 'post', path: `/admin/curriculum-schemas/${MISSING_ID}/clone`, body: {} },
    access: { allow: [Role.SUPER_ADMIN] },
  },
  {
    key: 'PATCH /admin/curriculum-schemas/:id',
    request: { method: 'patch', path: `/admin/curriculum-schemas/${MISSING_ID}`, body: {} },
    access: { allow: [Role.SUPER_ADMIN] },
  },
  {
    key: 'DELETE /admin/curriculum-schemas/:id',
    request: { method: 'delete', path: `/admin/curriculum-schemas/${MISSING_ID}` },
    access: { allow: [Role.SUPER_ADMIN] },
  },
  {
    key: 'GET /admin/curricula',
    request: { method: 'get', path: '/admin/curricula' },
    access: { allow: [Role.SUPER_ADMIN] },
  },
  {
    key: 'GET /admin/curricula/:id',
    request: { method: 'get', path: `/admin/curricula/${MISSING_ID}` },
    access: { allow: [Role.SUPER_ADMIN] },
  },
  {
    key: 'GET /admin/curricula/:id/tree',
    request: { method: 'get', path: `/admin/curricula/${MISSING_ID}/tree` },
    access: { allow: [Role.SUPER_ADMIN] },
  },
  {
    key: 'POST /admin/curricula',
    request: { method: 'post', path: '/admin/curricula', body: {} },
    access: { allow: [Role.SUPER_ADMIN] },
  },
  {
    key: 'PATCH /admin/curricula/:id',
    request: { method: 'patch', path: `/admin/curricula/${MISSING_ID}`, body: {} },
    access: { allow: [Role.SUPER_ADMIN] },
  },
  // Publish and unpublish change what every entitled school can see, so they are
  // explicit routes rather than a status field on the PATCH body.
  {
    key: 'POST /admin/curricula/:id/publish',
    request: { method: 'post', path: `/admin/curricula/${MISSING_ID}/publish`, body: {} },
    access: { allow: [Role.SUPER_ADMIN] },
  },
  {
    key: 'POST /admin/curricula/:id/unpublish',
    request: { method: 'post', path: `/admin/curricula/${MISSING_ID}/unpublish`, body: {} },
    access: { allow: [Role.SUPER_ADMIN] },
  },
  // A 500 here would mean the entitlement and video pre-checks reached a tenant-scoped
  // model from a Curriculum root rather than being rooted at the referencing model.
  {
    key: 'DELETE /admin/curricula/:id',
    request: { method: 'delete', path: `/admin/curricula/${MISSING_ID}` },
    access: { allow: [Role.SUPER_ADMIN] },
  },
  {
    key: 'POST /admin/curricula/:id/nodes',
    request: { method: 'post', path: `/admin/curricula/${MISSING_ID}/nodes`, body: {} },
    access: { allow: [Role.SUPER_ADMIN] },
  },
  {
    key: 'PATCH /admin/content-nodes/:id',
    request: { method: 'patch', path: `/admin/content-nodes/${MISSING_ID}`, body: {} },
    access: { allow: [Role.SUPER_ADMIN] },
  },
  {
    key: 'POST /admin/content-nodes/:id/move',
    request: { method: 'post', path: `/admin/content-nodes/${MISSING_ID}/move`, body: {} },
    access: { allow: [Role.SUPER_ADMIN] },
  },
  {
    key: 'DELETE /admin/content-nodes/:id',
    request: { method: 'delete', path: `/admin/content-nodes/${MISSING_ID}` },
    access: { allow: [Role.SUPER_ADMIN] },
  },

  // The school-facing library structure. Same role set as /videos: browsing entitled
  // content is a SCHOOL_ADMIN, TEACHER and STUDENT capability.
  {
    key: 'GET /curricula',
    request: { method: 'get', path: '/curricula' },
    access: { allow: [Role.SCHOOL_ADMIN, Role.TEACHER, Role.STUDENT] },
  },
  {
    key: 'GET /curricula/:id/tree',
    request: { method: 'get', path: `/curricula/${MISSING_ID}/tree` },
    access: { allow: [Role.SCHOOL_ADMIN, Role.TEACHER, Role.STUDENT] },
  },

  // Student onboarding (F-08 first slice) — tenant-scoped SCHOOL_ADMIN work, with
  // read access also granted to TEACHER.
  {
    key: 'GET /students/bulk/template',
    request: { method: 'get', path: '/students/bulk/template' },
    access: { allow: [Role.SCHOOL_ADMIN] },
  },
  // Sent as JSON rather than multipart: multer passes a non-multipart body straight
  // through, so the handler sees no file and answers 400 — an authorization pass, which
  // is all this table asserts.
  {
    key: 'POST /students/bulk',
    request: { method: 'post', path: '/students/bulk', body: {} },
    access: { allow: [Role.SCHOOL_ADMIN] },
  },
  {
    key: 'GET /students/bulk/:batchId',
    request: { method: 'get', path: `/students/bulk/${MISSING_ID}` },
    access: { allow: [Role.SCHOOL_ADMIN] },
  },
  {
    key: 'POST /students/bulk/:batchId/confirm',
    request: { method: 'post', path: `/students/bulk/${MISSING_ID}/confirm`, body: {} },
    access: { allow: [Role.SCHOOL_ADMIN] },
  },
  {
    key: 'GET /students/bulk/:batchId/errors',
    request: { method: 'get', path: `/students/bulk/${MISSING_ID}/errors` },
    access: { allow: [Role.SCHOOL_ADMIN] },
  },
  {
    key: 'POST /students',
    request: { method: 'post', path: '/students', body: {} },
    access: { allow: [Role.SCHOOL_ADMIN] },
  },
  {
    key: 'GET /students',
    request: { method: 'get', path: '/students' },
    access: { allow: [Role.SCHOOL_ADMIN, Role.TEACHER] },
  },
  {
    key: 'PATCH /students/:id',
    request: { method: 'patch', path: `/students/${MISSING_ID}`, body: {} },
    access: { allow: [Role.SCHOOL_ADMIN] },
  },
  {
    key: 'GET /students/:id/password',
    request: { method: 'get', path: `/students/${MISSING_ID}/password` },
    access: { allow: [Role.SCHOOL_ADMIN] },
  },
  {
    key: 'POST /students/:id/password',
    request: { method: 'post', path: `/students/${MISSING_ID}/password`, body: {} },
    access: { allow: [Role.SCHOOL_ADMIN] },
  },
  {
    key: 'GET /sections',
    request: { method: 'get', path: '/sections' },
    access: { allow: [Role.SCHOOL_ADMIN, Role.TEACHER] },
  },
  {
    key: 'POST /sections',
    request: { method: 'post', path: '/sections', body: {} },
    access: { allow: [Role.SCHOOL_ADMIN] },
  },

  // Teacher assignments (F-08) — tenant-scoped SCHOOL_ADMIN work, with read access also
  // granted to TEACHER.
  {
    key: 'POST /teacher-assignments',
    request: { method: 'post', path: '/teacher-assignments', body: {} },
    access: { allow: [Role.SCHOOL_ADMIN] },
  },
  {
    key: 'GET /teacher-assignments',
    request: { method: 'get', path: '/teacher-assignments' },
    access: { allow: [Role.SCHOOL_ADMIN, Role.TEACHER] },
  },
  {
    key: 'DELETE /teacher-assignments/:id',
    request: { method: 'delete', path: `/teacher-assignments/${MISSING_ID}` },
    access: { allow: [Role.SCHOOL_ADMIN] },
  },

  // Video library management — SUPER_ADMIN only.
  {
    key: 'GET /admin/videos',
    request: { method: 'get', path: '/admin/videos' },
    access: { allow: [Role.SUPER_ADMIN] },
  },
  {
    key: 'GET /admin/videos/:id',
    request: { method: 'get', path: `/admin/videos/${MISSING_ID}` },
    access: { allow: [Role.SUPER_ADMIN] },
  },
  {
    key: 'PATCH /admin/videos/:id',
    request: { method: 'patch', path: `/admin/videos/${MISSING_ID}`, body: {} },
    access: { allow: [Role.SUPER_ADMIN] },
  },
  {
    key: 'POST /admin/videos',
    request: { method: 'post', path: '/admin/videos', body: {} },
    access: { allow: [Role.SUPER_ADMIN] },
  },
  {
    key: 'POST /admin/videos/:id/uploaded',
    request: { method: 'post', path: `/admin/videos/${MISSING_ID}/uploaded`, body: {} },
    access: { allow: [Role.SUPER_ADMIN] },
  },
  {
    key: 'POST /admin/videos/:id/upload-url',
    request: { method: 'post', path: `/admin/videos/${MISSING_ID}/upload-url`, body: {} },
    access: { allow: [Role.SUPER_ADMIN] },
  },
  {
    key: 'POST /admin/videos/:id/retry',
    request: { method: 'post', path: `/admin/videos/${MISSING_ID}/retry`, body: {} },
    access: { allow: [Role.SUPER_ADMIN] },
  },
  {
    key: 'GET /admin/content-impact',
    request: { method: 'get', path: '/admin/content-impact?curriculumId=x' },
    access: { allow: [Role.SUPER_ADMIN] },
  },
  {
    key: 'DELETE /admin/videos/:id',
    request: { method: 'delete', path: `/admin/videos/${MISSING_ID}` },
    access: { allow: [Role.SUPER_ADMIN] },
  },

  { key: 'GET /admin/documents', request: { method: 'get', path: '/admin/documents' }, access: { allow: [Role.SUPER_ADMIN] } },
  { key: 'GET /admin/documents/:id', request: { method: 'get', path: `/admin/documents/${MISSING_ID}` }, access: { allow: [Role.SUPER_ADMIN] } },
  { key: 'GET /admin/documents/:id/download', request: { method: 'get', path: `/admin/documents/${MISSING_ID}/download` }, access: { allow: [Role.SUPER_ADMIN] } },
  { key: 'POST /admin/documents', request: { method: 'post', path: '/admin/documents', body: {} }, access: { allow: [Role.SUPER_ADMIN] } },
  { key: 'PATCH /admin/documents/:id', request: { method: 'patch', path: `/admin/documents/${MISSING_ID}`, body: {} }, access: { allow: [Role.SUPER_ADMIN] } },
  { key: 'POST /admin/documents/:id/uploaded', request: { method: 'post', path: `/admin/documents/${MISSING_ID}/uploaded`, body: {} }, access: { allow: [Role.SUPER_ADMIN] } },
  { key: 'POST /admin/documents/:id/upload-url', request: { method: 'post', path: `/admin/documents/${MISSING_ID}/upload-url`, body: {} }, access: { allow: [Role.SUPER_ADMIN] } },
  { key: 'DELETE /admin/documents/:id', request: { method: 'delete', path: `/admin/documents/${MISSING_ID}` }, access: { allow: [Role.SUPER_ADMIN] } },

  // The transcode worker's result callback. Not JWT-authenticated and not @Public: it is
  // gated by WorkerAuthGuard's HMAC over the raw body, which the per-role loop below
  // cannot express, so its auth assertions live in transcode-callback.e2e-spec.ts.
  {
    key: 'POST /internal/transcode/callback',
    request: { method: 'post', path: '/internal/transcode/callback', body: {} },
    access: 'worker',
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
    key: 'GET /admin/entitlements/overview',
    request: { method: 'get', path: '/admin/entitlements/overview' },
    access: { allow: [Role.SUPER_ADMIN] },
  },
  {
    key: 'POST /admin/schools/:schoolId/entitlements',
    request: { method: 'post', path: `/admin/schools/${MISSING_ID}/entitlements`, body: {} },
    access: { allow: [Role.SUPER_ADMIN] },
  },
  {
    key: 'PUT /admin/schools/:schoolId/entitlements',
    request: { method: 'put', path: `/admin/schools/${MISSING_ID}/entitlements`, body: { curriculumIds: [] } },
    access: { allow: [Role.SUPER_ADMIN] },
  },
  {
    key: 'DELETE /admin/schools/:schoolId/entitlements/:id',
    request: { method: 'delete', path: `/admin/schools/${MISSING_ID}/entitlements/${MISSING_ID}` },
    access: { allow: [Role.SUPER_ADMIN] },
  },

  // The school-facing library admits tenant admins to the same entitled read/watch
  // surface as teachers and students. SUPER_ADMIN uses the platform authoring surface.
  {
    key: 'GET /videos',
    request: { method: 'get', path: '/videos' },
    access: { allow: [Role.SCHOOL_ADMIN, Role.TEACHER, Role.STUDENT] },
  },
  {
    key: 'GET /videos/:id',
    request: { method: 'get', path: `/videos/${MISSING_ID}` },
    access: { allow: [Role.SCHOOL_ADMIN, Role.TEACHER, Role.STUDENT] },
  },
  { key: 'GET /documents', request: { method: 'get', path: '/documents' }, access: { allow: [Role.SCHOOL_ADMIN, Role.TEACHER, Role.STUDENT] } },
  { key: 'GET /documents/:id', request: { method: 'get', path: `/documents/${MISSING_ID}` }, access: { allow: [Role.SCHOOL_ADMIN, Role.TEACHER, Role.STUDENT] } },
  { key: 'GET /documents/:id/download', request: { method: 'get', path: `/documents/${MISSING_ID}/download` }, access: { allow: [Role.SCHOOL_ADMIN, Role.TEACHER, Role.STUDENT] } },
  {
    key: 'GET /videos/:id/playback-token',
    request: { method: 'get', path: `/videos/${MISSING_ID}/playback-token` },
    access: { allow: [Role.SUPER_ADMIN, Role.SCHOOL_ADMIN, Role.TEACHER, Role.STUDENT] },
  },
  { key: 'GET /videos/:id/hls/master.m3u8', request: { method: 'get', path: `/videos/${MISSING_ID}/hls/master.m3u8` }, access: 'playback-token' },
  { key: 'GET /videos/:id/hls/:rendition/playlist.m3u8', request: { method: 'get', path: `/videos/${MISSING_ID}/hls/360p/playlist.m3u8` }, access: 'playback-token' },
  { key: 'GET /videos/:id/hls/:rendition/:segment', request: { method: 'get', path: `/videos/${MISSING_ID}/hls/360p/segment_000.ts` }, access: 'playback-token' },
  { key: 'GET /videos/:id/poster.jpg', request: { method: 'get', path: `/videos/${MISSING_ID}/poster.jpg` }, access: 'playback-token' },
];

// Tenant admins may consume licensed content, but platform authoring and cross-tenant
// entitlement management remain SUPER_ADMIN-only.
const CONTENT_AUTHORING_AND_ENTITLEMENT_PATHS = [
  '/admin/videos',
  '/admin/documents',
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
      const undeclared = discovered.filter(
        (r) => !r.isPublic && !r.isWorker && !r.isPlaybackToken && (!r.roles || r.roles.length === 0),
      );
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
        } else if (row?.access === 'worker') {
          // Both halves matter: @WorkerRoute() is what turns WorkerAuthGuard on, and a
          // stray @Public() alongside it would switch that guard back off.
          expect(route.isWorker).toBe(true);
          expect(route.isPublic).toBe(false);
        } else if (row?.access === 'playback-token') {
          expect(route.isPlaybackToken).toBe(true);
          expect(route.isPublic).toBe(false);
          expect(route.roles).toBeUndefined();
        } else if (row) {
          expect([...(route.roles ?? [])].sort()).toEqual([...row.access.allow].sort());
        }
      }
    });
  });

  // Every string access value is a non-role-gated category ('public', 'worker'), so this
  // must test the *type*, not inequality against 'public' — a 'worker' row reaching the
  // per-role loop below would blow up on row.access.allow being undefined.
  const gatedRows = MATRIX.filter(
    (row): row is MatrixRow & { access: { allow: Role[] } } => typeof row.access !== 'string',
  );

  // The two role-wide acceptance criteria, asserted over the whole table rather than
  // route by route, so a new content or admin route that grants the wrong role fails
  // here without anyone remembering to add a case. The declaration tests above already
  // prove MATRIX matches the decorators actually on the handlers, so asserting against
  // the table is equivalent to asserting against the app — and the per-row HTTP tests
  // below independently confirm the 403.
  describe('acceptance criteria', () => {
    it('denies SCHOOL_ADMIN every content-authoring and entitlement endpoint', () => {
      const contentRows = gatedRows.filter((row) =>
        CONTENT_AUTHORING_AND_ENTITLEMENT_PATHS.some((path) => pathOf(row.key).includes(path)),
      );

      // Guards against the filter silently matching nothing and passing vacuously.
      expect(contentRows.length).toBeGreaterThanOrEqual(26);
      expect(
        contentRows.filter((row) => row.access.allow.includes(Role.SCHOOL_ADMIN)).map((r) => r.key),
      ).toEqual([]);
    });

    it('denies TEACHER and STUDENT every admin endpoint', () => {
      const adminRows = gatedRows.filter((row) => pathOf(row.key).startsWith('/admin/'));

      expect(adminRows.length).toBeGreaterThanOrEqual(24);
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
