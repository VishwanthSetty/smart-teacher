import { Prisma } from '@prisma/client';
import { MissingTenantContextError } from './tenant-guard.errors';
import { canReachTenantScoped } from './tenant-relations';
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
    const ctx = tenantContext.getOrUndefined();
    if (ctx?.bypassTenantScope) {
      return query(args);
    }

    // A query rooted at a model with no path to a tenant-scoped model can neither read
    // nor write tenant data, whatever its args say — the only genuinely free pass.
    if (!canReachTenantScoped(model)) {
      return query(args);
    }

    const schoolId = ctx?.isPopulated ? ctx.schoolId : null;

    // A tenant-scoped root always needs a tenant. A non-scoped root only needs one if its
    // args actually reach a scoped relation, which the nested walkers decide for themselves.
    if (isTenantScoped(model) && schoolId === null) {
      throw new MissingTenantContextError(model, operation);
    }

    return query(applyTenantScope(model, operation, args, schoolId));
  };
}

// Row-Level Security is deferred to a follow-up (F-02b): this extension is the only
// line of defence today, and it only covers the Prisma Client query API. `$queryRaw`
// / `$executeRaw` bypass it entirely — do not use raw SQL against tenant-scoped tables
// until RLS lands. `raw-sql-guard.spec.ts` fails the build if that rule is broken.
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
