import { Prisma } from '@prisma/client';

// Models that carry a tenant-owned `schoolId` and must never be queried or written
// without an active tenant context. Add a new model here the same day its migration
// adds a non-null `school_id` FK — the `satisfies` check below makes a typo'd model
// name a compile error, not a silent gap in coverage.
export const TENANT_SCOPED_MODELS = ['User'] as const satisfies readonly Prisma.ModelName[];

export type TenantScopedModel = (typeof TENANT_SCOPED_MODELS)[number];

export function isTenantScoped(model: string): model is TenantScopedModel {
  return (TENANT_SCOPED_MODELS as readonly string[]).includes(model);
}
