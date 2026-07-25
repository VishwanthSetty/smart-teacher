import { TenantContext } from './tenant-context.interface';
import { TenantContextService } from './tenant-context.service';

// Mimics Prisma's lazy query builders: nothing happens until `.then()` is called,
// at which point it synchronously records whichever tenant context is active.
function lazyThenable(onDispatch: () => void): Promise<void> {
  return {
    then(resolve: (value: void) => void) {
      onDispatch();
      resolve(undefined);
    },
  } as unknown as Promise<void>;
}

describe('TenantContextService', () => {
  it('returns undefined outside of any run()/runAs() call', () => {
    const service = new TenantContextService();
    expect(service.getOrUndefined()).toBeUndefined();
  });

  it('enters an empty, unpopulated store via run()', () => {
    const service = new TenantContextService();
    const seen = service.run(() => service.getOrUndefined());
    expect(seen).toEqual({ schoolId: null, bypassTenantScope: false, isPopulated: false });
  });

  it('populate() mutates the store entered by run(), and no-ops with no active store', () => {
    const service = new TenantContextService();

    // No active store: must not throw.
    expect(() => service.populate('school-a', false)).not.toThrow();

    const seen = service.run(() => {
      service.populate('school-a', false);
      return service.getOrUndefined();
    });
    expect(seen).toEqual({ schoolId: 'school-a', bypassTenantScope: false, isPopulated: true });
  });

  it('runAs keeps the context active until a lazy thenable actually dispatches', async () => {
    const service = new TenantContextService();
    let seenAtDispatch: TenantContext | undefined;

    await service.runAs('school-a', false, () =>
      lazyThenable(() => {
        seenAtDispatch = service.getOrUndefined();
      }),
    );

    expect(seenAtDispatch).toEqual({ schoolId: 'school-a', bypassTenantScope: false, isPopulated: true });
  });

  it('runWithSystemBypass runs fn under a null-schoolId, bypassed context', async () => {
    const service = new TenantContextService();
    let seenAtDispatch: TenantContext | undefined;

    await service.runWithSystemBypass(() =>
      lazyThenable(() => {
        seenAtDispatch = service.getOrUndefined();
      }),
    );

    expect(seenAtDispatch).toEqual({ schoolId: null, bypassTenantScope: true, isPopulated: true });
  });

  it('restores the outer context once a nested runAs/runWithSystemBypass call returns', async () => {
    const service = new TenantContextService();

    await service.run(async () => {
      service.populate('school-outer', false);
      await service.runWithSystemBypass(() => lazyThenable(() => undefined));
      expect(service.getOrUndefined()).toEqual({
        schoolId: 'school-outer',
        bypassTenantScope: false,
        isPopulated: true,
      });
    });
  });
});
