import { TenantContextService } from '../tenancy/tenant-context.service';
import { MissingTenantContextError } from './tenant-guard.errors';
import { tenantGuardOperationHandler } from './tenant-guard.extension';

describe('tenantGuardOperationHandler', () => {
  let tenantContext: TenantContextService;

  beforeEach(() => {
    tenantContext = new TenantContextService();
  });

  it('passes args through untouched for a non-tenant-scoped model', async () => {
    const handler = tenantGuardOperationHandler(tenantContext);
    const query = jest.fn().mockResolvedValue('ok');

    const result = await tenantContext.run(() => {
      tenantContext.populate('school-a', false);
      return handler({ model: 'School', operation: 'findMany', args: { where: {} }, query });
    });

    expect(query).toHaveBeenCalledWith({ where: {} });
    expect(result).toBe('ok');
  });

  it('scopes a tenant-scoped model query to the current schoolId', async () => {
    const handler = tenantGuardOperationHandler(tenantContext);
    const query = jest.fn().mockResolvedValue('ok');

    await tenantContext.run(() => {
      tenantContext.populate('school-a', false);
      return handler({ model: 'User', operation: 'findMany', args: { where: { role: 'TEACHER' } }, query });
    });

    expect(query).toHaveBeenCalledWith({ where: { AND: [{ role: 'TEACHER' }, { schoolId: 'school-a' }] } });
  });

  it('passes args through untouched when bypassTenantScope is set', async () => {
    const handler = tenantGuardOperationHandler(tenantContext);
    const query = jest.fn().mockResolvedValue('ok');

    await tenantContext.run(() => {
      tenantContext.populate(null, true);
      return handler({ model: 'User', operation: 'findMany', args: { where: {} }, query });
    });

    expect(query).toHaveBeenCalledWith({ where: {} });
  });

  it('throws MissingTenantContextError when the store was never populated', async () => {
    const handler = tenantGuardOperationHandler(tenantContext);
    const query = jest.fn().mockResolvedValue('ok');

    await expect(
      tenantContext.run(() => handler({ model: 'User', operation: 'findMany', args: {}, query })),
    ).rejects.toBeInstanceOf(MissingTenantContextError);
    expect(query).not.toHaveBeenCalled();
  });

  it('throws MissingTenantContextError when schoolId is null and not bypassed', async () => {
    const handler = tenantGuardOperationHandler(tenantContext);
    const query = jest.fn().mockResolvedValue('ok');

    await expect(
      tenantContext.run(() => {
        tenantContext.populate(null, false);
        return handler({ model: 'User', operation: 'findMany', args: {}, query });
      }),
    ).rejects.toBeInstanceOf(MissingTenantContextError);
    expect(query).not.toHaveBeenCalled();
  });

  it('throws MissingTenantContextError when there is no store at all (outside a request)', async () => {
    const handler = tenantGuardOperationHandler(tenantContext);
    const query = jest.fn().mockResolvedValue('ok');

    await expect(handler({ model: 'User', operation: 'findMany', args: {}, query })).rejects.toBeInstanceOf(
      MissingTenantContextError,
    );
    expect(query).not.toHaveBeenCalled();
  });
});
