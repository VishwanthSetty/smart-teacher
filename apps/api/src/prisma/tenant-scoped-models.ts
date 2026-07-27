import { Prisma } from '@prisma/client';

// Models that carry a tenant-owned `schoolId` and must never be queried or written
// without an active tenant context. Add a new model here the same day its migration
// adds a non-null `school_id` FK — the `satisfies` check below makes a typo'd model
// name a compile error, and tenant-model-coverage.spec.ts fails the build if a model
// grows a `schoolId` column without being listed here.
export const TENANT_SCOPED_MODELS = [
  'User',
  'SchoolContentEntitlement',
] as const satisfies readonly Prisma.ModelName[];

// Platform content: authored once for the whole platform, carries no `schoolId`, and
// is therefore invisible to tenant scoping by design rather than by omission. This is
// the reviewed F-02 exception — a school reaches this content only through
// SchoolContentEntitlement (which is tenant-scoped), never by reading these tables
// directly. Listing them explicitly is what lets the coverage spec tell "deliberately
// global" apart from "someone forgot".
export const PLATFORM_GLOBAL_MODELS = [
  'GradeLevel',
  'Subject',
  'Video',
] as const satisfies readonly Prisma.ModelName[];

export type TenantScopedModel = (typeof TENANT_SCOPED_MODELS)[number];

export function isTenantScoped(model: string): model is TenantScopedModel {
  return (TENANT_SCOPED_MODELS as readonly string[]).includes(model);
}
