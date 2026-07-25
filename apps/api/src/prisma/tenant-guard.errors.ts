// A tenant-scoped model was queried with no active tenant context and no explicit
// bypass. This is always a programming error (a route or service path is missing
// @BypassTenantScope() or TenantContextService.runWithSystemBypass()) — never a
// legitimate runtime condition to recover from.
export class MissingTenantContextError extends Error {
  constructor(model: string, operation: string) {
    super(
      `Tenant context missing for ${model}.${operation} — this code path must run ` +
        'inside an authenticated request or an explicit system bypass.',
    );
    this.name = 'MissingTenantContextError';
  }
}

// A write payload explicitly named a schoolId (or a school.connect id) belonging to a
// different tenant than the current request's context.
export class TenantMismatchError extends Error {
  constructor(model: string, operation: string) {
    super(`${model}.${operation}: payload schoolId does not match the current tenant.`);
    this.name = 'TenantMismatchError';
  }
}

// A tenant-scoped model was queried with an operation the guard doesn't know how to
// scope safely. Fail loudly rather than let it through unscoped.
export class UnsupportedTenantOperationError extends Error {
  constructor(model: string, operation: string) {
    super(`Tenant guard does not support ${model}.${operation}; scope it explicitly or add support.`);
    this.name = 'UnsupportedTenantOperationError';
  }
}
