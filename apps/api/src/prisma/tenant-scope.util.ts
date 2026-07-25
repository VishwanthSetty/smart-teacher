import { TenantMismatchError, UnsupportedTenantOperationError } from './tenant-guard.errors';

// Prisma's per-operation arg shapes are a large generated union; the guard has to
// operate on all of them generically, so this file is the one place that narrows
// through `unknown` rather than the generated types. Kept small and unit-tested.
export type PrismaArgs = Record<string, unknown>;

const SCOPE_ALL_WHERE_OPERATIONS = new Set([
  'findMany',
  'findFirst',
  'findFirstOrThrow',
  'count',
  'aggregate',
  'groupBy',
  'updateMany',
  'deleteMany',
]);

const SCOPE_UNIQUE_WHERE_OPERATIONS = new Set(['findUnique', 'findUniqueOrThrow', 'update', 'delete']);

function isRecord(value: unknown): value is PrismaArgs {
  return typeof value === 'object' && value !== null;
}

function assertNoSchoolIdMismatch(model: string, operation: string, data: unknown, schoolId: string): void {
  if (!isRecord(data)) {
    return;
  }
  if ('schoolId' in data && data.schoolId !== undefined && data.schoolId !== schoolId) {
    throw new TenantMismatchError(model, operation);
  }
  if ('school' in data && isRecord(data.school) && isRecord(data.school.connect)) {
    if (data.school.connect.id !== undefined && data.school.connect.id !== schoolId) {
      throw new TenantMismatchError(model, operation);
    }
  }
}

function stampSchoolId(data: unknown, schoolId: string): unknown {
  if (!isRecord(data) || 'school' in data) {
    // Relation form (`school: { connect: { id } }`) was already validated above; leave as-is.
    return data;
  }
  return { ...data, schoolId: data.schoolId ?? schoolId };
}

function scopeWhereAll(where: unknown, schoolId: string): PrismaArgs {
  return { AND: [where ?? {}, { schoolId }] };
}

function scopeWhereUnique(where: unknown, schoolId: string): PrismaArgs {
  return { ...(isRecord(where) ? where : {}), schoolId };
}

export function applyTenantScope(
  model: string,
  operation: string,
  args: PrismaArgs,
  schoolId: string,
): PrismaArgs {
  const next: PrismaArgs = { ...args };

  if (SCOPE_ALL_WHERE_OPERATIONS.has(operation)) {
    next.where = scopeWhereAll(args.where, schoolId);
    if (operation === 'updateMany') {
      assertNoSchoolIdMismatch(model, operation, args.data, schoolId);
    }
    return next;
  }

  if (SCOPE_UNIQUE_WHERE_OPERATIONS.has(operation)) {
    next.where = scopeWhereUnique(args.where, schoolId);
    if (operation === 'update') {
      assertNoSchoolIdMismatch(model, operation, args.data, schoolId);
    }
    return next;
  }

  if (operation === 'create') {
    assertNoSchoolIdMismatch(model, operation, args.data, schoolId);
    next.data = stampSchoolId(args.data, schoolId);
    return next;
  }

  if (operation === 'createMany' || operation === 'createManyAndReturn') {
    const rows = Array.isArray(args.data) ? args.data : [args.data];
    rows.forEach((row) => assertNoSchoolIdMismatch(model, operation, row, schoolId));
    next.data = rows.map((row) => stampSchoolId(row, schoolId));
    return next;
  }

  if (operation === 'upsert') {
    next.where = scopeWhereUnique(args.where, schoolId);
    assertNoSchoolIdMismatch(model, operation, args.create, schoolId);
    next.create = stampSchoolId(args.create, schoolId);
    assertNoSchoolIdMismatch(model, operation, args.update, schoolId);
    return next;
  }

  throw new UnsupportedTenantOperationError(model, operation);
}
