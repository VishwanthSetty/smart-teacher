import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';
import { TenantContext } from './tenant-context.interface';

@Injectable()
export class TenantContextService {
  private readonly storage = new AsyncLocalStorage<TenantContext>();

  // Enters an empty, unpopulated store for the lifetime of `fn`. The interceptor fills
  // it in once `request.user` is known (guards run before interceptors), so routes with
  // no authenticated user simply never get populated — which is what makes fail-closed
  // scoping work below.
  run<T>(fn: () => T): T {
    return this.storage.run({ schoolId: null, bypassTenantScope: false, isPopulated: false }, fn);
  }

  getOrUndefined(): TenantContext | undefined {
    return this.storage.getStore();
  }

  // Mutates the store already entered by `run()` rather than replacing it, so the
  // change is visible to the rest of the same request's async chain.
  populate(schoolId: string | null, bypassTenantScope: boolean): void {
    const store = this.storage.getStore();
    if (!store) {
      return;
    }
    store.schoolId = schoolId;
    store.bypassTenantScope = bypassTenantScope;
    store.isPopulated = true;
  }

  // Runs `fn` inside a fresh, isolated tenant context and awaits it *inside* the
  // AsyncLocalStorage boundary. This is required, not stylistic: Prisma's query
  // builders are lazy thenables that only dispatch (and hit tenant-guard.extension's
  // hook) once `.then()`/`await` is called on them. If `fn` merely returned the
  // un-awaited query, the dispatch would happen later, outside this boundary, in
  // whatever context is ambient by the time the *caller* awaits the result — silently
  // losing the context we just set up.
  async runAs<T>(schoolId: string | null, bypassTenantScope: boolean, fn: () => Promise<T>): Promise<T> {
    return this.storage.run({ schoolId, bypassTenantScope, isPopulated: true }, async () => {
      return await fn();
    });
  }

  // For code that legitimately runs before tenant identity is known (pre-auth login
  // lookups) — an explicit, grep-able escape hatch rather than an implicit no-op.
  runWithSystemBypass<T>(fn: () => Promise<T>): Promise<T> {
    return this.runAs(null, true, fn);
  }
}
