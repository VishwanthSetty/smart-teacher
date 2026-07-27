import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

export const ROLES_KEY = 'roles';

// RolesGuard uses getAllAndOverride, not getAllAndMerge: a method-level @Roles fully
// replaces the class-level list rather than widening it. Merge would let a method that
// narrows its roles silently widen back to the class list, which is the opposite of
// least privilege and invisible at the call site.
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

// "Any authenticated user, whatever their role." Expressed as the full role list rather
// than a second metadata key, so RolesGuard and the route-audit test only ever read one
// key, and a role added to the enum is included here by construction.
//
// SUPER_ADMIN is never granted implicitly elsewhere — every route enumerates it
// explicitly. An implicit hierarchy would hand SUPER_ADMIN every tenant-scoped route,
// which either 500s (MissingTenantContextError, on routes with no @BypassTenantScope)
// or silently grants unreviewed cross-tenant access (on routes that have it). See
// BypassTenantScope: "there is no ambient bypass by role alone" — the same principle
// applies to role-based access in general.
export const AnyRole = () => Roles(...(Object.values(Role) as Role[]));
