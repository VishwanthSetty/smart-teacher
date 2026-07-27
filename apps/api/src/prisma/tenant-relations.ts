import { Prisma } from '@prisma/client';
import { isTenantScoped } from './tenant-scoped-models';

export interface RelationTarget {
  readonly model: string;
  readonly isList: boolean;
}

// Prisma's `query` extension hook fires once per *top-level* operation, so the tenant
// guard has to discover nested relations itself. The DMMF is the only description of
// the relation graph available at runtime; reading it once at module load keeps the
// per-query cost to a map lookup.
const relationsByModel = new Map<string, Map<string, RelationTarget>>();

for (const model of Prisma.dmmf.datamodel.models) {
  const relations = new Map<string, RelationTarget>();
  for (const field of model.fields) {
    if (field.kind === 'object') {
      relations.set(field.name, { model: field.type, isList: field.isList });
    }
  }
  relationsByModel.set(model.name, relations);
}

export function relationTarget(model: string, field: string): RelationTarget | undefined {
  return relationsByModel.get(model)?.get(field);
}

const reachabilityCache = new Map<string, boolean>();

function reaches(model: string, visiting: Set<string>): boolean {
  const cached = reachabilityCache.get(model);
  if (cached !== undefined) {
    return cached;
  }
  // Relation graphs are cyclic (School -> User -> School). Treat a model already on the
  // current path as "no new information" rather than recursing forever; if a tenant-scoped
  // model is reachable at all, some other branch of the search reaches it.
  if (visiting.has(model)) {
    return false;
  }
  visiting.add(model);

  let result = false;
  for (const target of relationsByModel.get(model)?.values() ?? []) {
    if (isTenantScoped(target.model) || reaches(target.model, visiting)) {
      result = true;
      break;
    }
  }

  visiting.delete(model);
  // Only memoize a positive result: a `false` computed while a cycle was open is
  // conditional on the current path and must not be cached as a general answer.
  if (result) {
    reachabilityCache.set(model, true);
  }
  return result;
}

// True when a tenant-scoped model can be reached from `model` by following relations,
// i.e. when a query rooted at `model` could carry a nested read or write that the guard
// must rewrite. False is the fast path: nothing tenant-owned is reachable, so the guard
// can hand the args straight through.
export function canReachTenantScoped(model: string): boolean {
  if (isTenantScoped(model)) {
    return true;
  }
  const cached = reachabilityCache.get(model);
  if (cached !== undefined) {
    return cached;
  }
  // Safe to memoize either way here, unlike inside `reaches`: no cycle is open at the
  // top of the search, so a `false` is unconditional.
  const result = reaches(model, new Set());
  reachabilityCache.set(model, result);
  return result;
}
