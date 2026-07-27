import {
  MissingTenantContextError,
  TenantMismatchError,
  UnsupportedTenantNestedOperationError,
  UnsupportedTenantOperationError,
} from './tenant-guard.errors';
import { canReachTenantScoped, relationTarget, type RelationTarget } from './tenant-relations';
import { isTenantScoped } from './tenant-scoped-models';

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

// ---------------------------------------------------------------------------
// Root operation scoping
// ---------------------------------------------------------------------------

function applyRootScope(model: string, operation: string, args: PrismaArgs, schoolId: string): PrismaArgs {
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

// ---------------------------------------------------------------------------
// Nested relation scoping
//
// Prisma's `query` extension hook fires once per *top-level* operation, so without
// the walkers below `school.findUnique({ include: { users: true } })` would hand back
// every tenant's users: the dispatched model is School, which is not tenant-scoped.
// The same applies to nested writes and to relation filters inside `where`.
//
// The tenant context is resolved lazily (`requireTenant`) rather than up front: a query
// rooted at a non-scoped model only needs a tenant when it actually reaches a scoped
// relation, so pre-auth paths that touch School alone keep working.
// ---------------------------------------------------------------------------

interface NestedContext {
  readonly operation: string;
  readonly schoolId: string | null;
}

function requireTenant(model: string, ctx: NestedContext): string {
  if (ctx.schoolId === null) {
    throw new MissingTenantContextError(model, ctx.operation);
  }
  return ctx.schoolId;
}

function mapEach(payload: unknown, fn: (item: unknown) => unknown): unknown {
  return Array.isArray(payload) ? payload.map(fn) : fn(payload);
}

// A to-one `include`/`update`/`delete` takes no `where`, so there is nothing to filter
// on. That is safe when the parent is itself tenant-scoped — the parent row was already
// restricted to this tenant, so its FK cannot point elsewhere — and unsafe otherwise.
function assertToOneTraversalIsScoped(
  parentModel: string,
  relation: string,
  target: RelationTarget,
  detail: string,
): void {
  if (!target.isList && !isTenantScoped(parentModel)) {
    throw new UnsupportedTenantNestedOperationError(parentModel, relation, detail);
  }
}

// --- reads -----------------------------------------------------------------

const RELATION_FILTER_EXISTENTIAL = ['some', 'none', 'is', 'isNot'] as const;
const LOGICAL_FILTER_KEYS = ['AND', 'OR', 'NOT'] as const;

function scopeRelationFilter(
  parentModel: string,
  relation: string,
  target: RelationTarget,
  filter: unknown,
  ctx: NestedContext,
): unknown {
  if (!isRecord(filter)) {
    return filter;
  }
  const next: PrismaArgs = { ...filter };

  if (isTenantScoped(target.model)) {
    const schoolId = requireTenant(parentModel, ctx);
    // `every` means "all related rows match"; AND-ing schoolId into the predicate would
    // change its meaning rather than restrict it, so there is no safe rewrite.
    if ('every' in next) {
      throw new UnsupportedTenantNestedOperationError(parentModel, relation, `${ctx.operation} where.every`);
    }
    for (const key of RELATION_FILTER_EXISTENTIAL) {
      if (key in next) {
        next[key] = { AND: [next[key] ?? {}, { schoolId }] };
      }
    }
    // A bare `{ relation: { ... } }` shorthand (to-one) has no wrapper key.
    if (!RELATION_FILTER_EXISTENTIAL.some((key) => key in filter)) {
      return { AND: [filter, { schoolId }] };
    }
  }

  for (const key of RELATION_FILTER_EXISTENTIAL) {
    if (isRecord(next[key])) {
      next[key] = scopeWhereNode(target.model, next[key], ctx);
    }
  }
  return next;
}

function scopeWhereNode(model: string, where: unknown, ctx: NestedContext): unknown {
  if (!isRecord(where)) {
    return where;
  }
  const next: PrismaArgs = { ...where };

  for (const key of LOGICAL_FILTER_KEYS) {
    const branch = next[key];
    if (Array.isArray(branch)) {
      next[key] = branch.map((item) => scopeWhereNode(model, item, ctx));
    } else if (isRecord(branch)) {
      next[key] = scopeWhereNode(model, branch, ctx);
    }
  }

  for (const [field, value] of Object.entries(where)) {
    const target = relationTarget(model, field);
    if (!target || !canReachTenantScoped(target.model)) {
      continue;
    }
    next[field] = scopeRelationFilter(model, field, target, value, ctx);
  }

  return next;
}

function scopeRelationSelection(
  parentModel: string,
  relation: string,
  target: RelationTarget,
  value: unknown,
  ctx: NestedContext,
): unknown {
  if (value === false || value === undefined) {
    return value;
  }

  const scoped = isTenantScoped(target.model);
  // `include: { x: true }` on a relation that needs no rewrite stays exactly as written.
  if (value === true && !scoped) {
    return value;
  }

  const child: PrismaArgs = value === true ? {} : isRecord(value) ? { ...value } : {};

  if (scoped) {
    const schoolId = requireTenant(parentModel, ctx);
    if (target.isList) {
      child.where = { AND: [child.where ?? {}, { schoolId }] };
    } else {
      assertToOneTraversalIsScoped(parentModel, relation, target, `${ctx.operation} include`);
    }
  }

  return scopeReadNode(target.model, child, ctx);
}

// Walks `where`, `include` and `select` at any depth, rewriting every hop that lands on
// a tenant-scoped model.
function scopeReadNode(model: string, node: PrismaArgs, ctx: NestedContext): PrismaArgs {
  const next: PrismaArgs = { ...node };

  if (isRecord(next.where)) {
    next.where = scopeWhereNode(model, next.where, ctx);
  }

  for (const key of ['include', 'select'] as const) {
    const selection = next[key];
    if (!isRecord(selection)) {
      continue;
    }
    const scopedSelection: PrismaArgs = { ...selection };
    for (const [field, value] of Object.entries(selection)) {
      const target = relationTarget(model, field);
      if (!target || !canReachTenantScoped(target.model)) {
        continue;
      }
      scopedSelection[field] = scopeRelationSelection(model, field, target, value, ctx);
    }
    next[key] = scopedSelection;
  }

  return next;
}

// --- writes ----------------------------------------------------------------

function scopeNestedCreate(childModel: string, payload: unknown, schoolId: string, ctx: NestedContext): unknown {
  assertNoSchoolIdMismatch(childModel, ctx.operation, payload, schoolId);
  const stamped = stampSchoolId(payload, schoolId);
  return isRecord(stamped) ? scopeWriteNode(childModel, stamped, ctx) : stamped;
}

function scopeNestedWriteVerb(
  parentModel: string,
  relation: string,
  target: RelationTarget,
  verb: string,
  payload: unknown,
  ctx: NestedContext,
): unknown {
  const childModel = target.model;
  const scoped = isTenantScoped(childModel);

  // Nothing tenant-owned at this hop: recurse only, so deeper relations still get scoped.
  if (!scoped) {
    return mapEach(payload, (item) => (isRecord(item) ? scopeWriteNode(childModel, item, ctx) : item));
  }

  // A nested write inherits its tenant from the row it hangs off. When that parent is not
  // itself tenant-scoped the guard cannot constrain which row the write lands on, so it
  // cannot make the child safe either: `school.update({ where: { id: B }, data: { users:
  // { create } } })` would write into School B whatever we stamped, and Prisma's nested
  // input for the tenant relation has no schoolId field to stamp in the first place.
  // Do the write against the child model directly, where stamping actually applies.
  if (!isTenantScoped(parentModel)) {
    throw new UnsupportedTenantNestedOperationError(parentModel, relation, `${ctx.operation} ${verb}`);
  }

  const schoolId = requireTenant(parentModel, ctx);

  switch (verb) {
    case 'create':
      return mapEach(payload, (item) => scopeNestedCreate(childModel, item, schoolId, ctx));

    case 'createMany': {
      if (!isRecord(payload)) {
        return payload;
      }
      const rows = Array.isArray(payload.data) ? payload.data : [payload.data];
      rows.forEach((row) => assertNoSchoolIdMismatch(childModel, ctx.operation, row, schoolId));
      return { ...payload, data: rows.map((row) => stampSchoolId(row, schoolId)) };
    }

    case 'connectOrCreate':
      return mapEach(payload, (item) => {
        if (!isRecord(item)) {
          return item;
        }
        return {
          ...item,
          where: scopeWhereUnique(item.where, schoolId),
          create: scopeNestedCreate(childModel, item.create, schoolId, ctx),
        };
      });

    case 'upsert':
      return mapEach(payload, (item) => {
        if (!isRecord(item)) {
          return item;
        }
        assertNoSchoolIdMismatch(childModel, ctx.operation, item.update, schoolId);
        return {
          ...item,
          // A to-one nested upsert has no `where` at all; only rewrite one if present.
          ...(item.where === undefined ? {} : { where: scopeWhereUnique(item.where, schoolId) }),
          create: scopeNestedCreate(childModel, item.create, schoolId, ctx),
          update: isRecord(item.update) ? scopeWriteNode(childModel, item.update, ctx) : item.update,
        };
      });

    case 'update':
      return mapEach(payload, (item) => {
        if (!isRecord(item)) {
          return item;
        }
        // To-many form is `{ where, data }`; to-one form is the data object itself.
        if ('data' in item) {
          assertNoSchoolIdMismatch(childModel, ctx.operation, item.data, schoolId);
          return {
            ...item,
            where: scopeWhereUnique(item.where, schoolId),
            data: isRecord(item.data) ? scopeWriteNode(childModel, item.data, ctx) : item.data,
          };
        }
        assertNoSchoolIdMismatch(childModel, ctx.operation, item, schoolId);
        return scopeWriteNode(childModel, item, ctx);
      });

    case 'updateMany':
      return mapEach(payload, (item) => {
        if (!isRecord(item)) {
          return item;
        }
        assertNoSchoolIdMismatch(childModel, ctx.operation, item.data, schoolId);
        return { ...item, where: scopeWhereAll(item.where, schoolId) };
      });

    case 'deleteMany':
      return mapEach(payload, (item) => scopeWhereAll(item, schoolId));

    // These all reference rows by unique id. Prisma's WhereUniqueInput accepts extra
    // filter fields, so an injected schoolId turns a cross-tenant reference into a
    // "record not found" failure instead of a silent cross-tenant link.
    case 'connect':
    case 'set':
    case 'disconnect':
    case 'delete':
      if (typeof payload === 'boolean') {
        // To-one `disconnect: true` / `delete: true`. There is no filter to inject, but the
        // parent is tenant-scoped (checked above), so the row it points at is this tenant's.
        return payload;
      }
      return mapEach(payload, (item) => scopeWhereUnique(item, schoolId));

    default:
      throw new UnsupportedTenantNestedOperationError(parentModel, relation, `${ctx.operation} ${verb}`);
  }
}

// Walks a write payload (`data`, `create`, `update`) for nested relation writes.
function scopeWriteNode(model: string, data: PrismaArgs, ctx: NestedContext): PrismaArgs {
  const next: PrismaArgs = { ...data };

  for (const [field, value] of Object.entries(data)) {
    const target = relationTarget(model, field);
    if (!target || !canReachTenantScoped(target.model) || !isRecord(value)) {
      continue;
    }
    // The `school` relation on a tenant-scoped model is the tenant key itself, already
    // validated by assertNoSchoolIdMismatch; rewriting it here would fight that check.
    if (field === 'school') {
      continue;
    }

    const scopedVerbs: PrismaArgs = { ...value };
    for (const [verb, payload] of Object.entries(value)) {
      scopedVerbs[verb] = scopeNestedWriteVerb(model, field, target, verb, payload, ctx);
    }
    next[field] = scopedVerbs;
  }

  return next;
}

const WRITE_PAYLOAD_KEYS = ['data', 'create', 'update'] as const;

function applyNestedScope(model: string, args: PrismaArgs, ctx: NestedContext): PrismaArgs {
  let next = scopeReadNode(model, args, ctx);

  for (const key of WRITE_PAYLOAD_KEYS) {
    const payload = next[key];
    if (Array.isArray(payload)) {
      next = { ...next, [key]: payload.map((row) => (isRecord(row) ? scopeWriteNode(model, row, ctx) : row)) };
    } else if (isRecord(payload)) {
      next = { ...next, [key]: scopeWriteNode(model, payload, ctx) };
    }
  }

  return next;
}

// `schoolId` is nullable because a query rooted at a non-tenant-scoped model may never
// reach a tenant-scoped relation, in which case no tenant context is required. The
// caller guarantees it is non-null whenever `model` itself is tenant-scoped.
export function applyTenantScope(
  model: string,
  operation: string,
  args: PrismaArgs,
  schoolId: string | null,
): PrismaArgs {
  const rooted =
    isTenantScoped(model) && schoolId !== null ? applyRootScope(model, operation, args, schoolId) : { ...args };

  return applyNestedScope(model, rooted, { operation, schoolId });
}
