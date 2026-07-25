import { Prisma } from '@prisma/client';
import { MissingTenantContextError } from './tenant-guard.errors';
import { isTenantScoped } from './tenant-scoped-models';
import { applyTenantScope, type PrismaArgs } from './tenant-scope.util';
import type { TenantContextService } from '../tenancy/tenant-context.service';

interface AllOperationsArgs {
  model: string;
  operation: string;
  args: PrismaArgs;
  query: (args: PrismaArgs) => Promise<unknown>;
}

// Split out from `tenantGuardExtension` so it can be unit-tested directly, without
// going through Prisma's `$extends`/`defineExtension` plumbing.
export function tenantGuardOperationHandler(tenantContext: TenantContextService) {
  return async ({ model, operation, args, query }: AllOperationsArgs): Promise<unknown> => {
    if (!isTenantScoped(model)) {
      return query(args);
    }

    const ctx = tenantContext.getOrUndefined();
    if (ctx?.bypassTenantScope) {
      return query(args);
    }

    if (!ctx?.isPopulated || ctx.schoolId === null) {
      throw new MissingTenantContextError(model, operation);
    }

    return query(applyTenantScope(model, operation, args, ctx.schoolId));
  };
}

// Row-Level Security is deferred to a follow-up (F-02b): this extension is the only
// line of defence today, and it only covers the Prisma Client query API. `$queryRaw`
// / `$executeRaw` bypass it entirely — do not use raw SQL against tenant-scoped tables
// until RLS lands.
export function tenantGuardExtension(tenantContext: TenantContextService) {
  return Prisma.defineExtension({
    name: 'tenantGuard',
    query: {
      $allModels: {
        $allOperations: tenantGuardOperationHandler(tenantContext),
      },
    },
  });
}
