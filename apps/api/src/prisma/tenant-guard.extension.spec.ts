import { TenantContextService } from '../tenancy/tenant-context.service';
import { MissingTenantContextError, UnsupportedTenantNestedOperationError } from './tenant-guard.errors';
import { tenantGuardOperationHandler } from './tenant-guard.extension';

describe('tenantGuardOperationHandler', () => {
  let tenantContext: TenantContextService;

  beforeEach(() => {
    tenantContext = new TenantContextService();
  });

  it('passes args through untouched for a model with no path to tenant data', async () => {
    const handler = tenantGuardOperationHandler(tenantContext);
    const query = jest.fn().mockResolvedValue('ok');

    const result = await tenantContext.run(() => {
      tenantContext.populate('school-a', false);
      return handler({ model: 'LoginAttempt', operation: 'findMany', args: { where: {} }, query });
    });

    expect(query).toHaveBeenCalledWith({ where: {} });
    expect(result).toBe('ok');
  });

  it('leaves a non-tenant-scoped root alone when its args never reach tenant data', async () => {
    const handler = tenantGuardOperationHandler(tenantContext);
    const query = jest.fn().mockResolvedValue('ok');

    await tenantContext.run(() => {
      tenantContext.populate('school-a', false);
      return handler({ model: 'School', operation: 'findMany', args: { where: { slug: 'demo' } }, query });
    });

    expect(query).toHaveBeenCalledWith({ where: { slug: 'demo' } });
  });

  it('scopes a nested relation reached from a non-tenant-scoped root', async () => {
    const handler = tenantGuardOperationHandler(tenantContext);
    const query = jest.fn().mockResolvedValue('ok');

    await tenantContext.run(() => {
      tenantContext.populate('school-a', false);
      return handler({ model: 'School', operation: 'findMany', args: { include: { users: true } }, query });
    });

    expect(query).toHaveBeenCalledWith({
      include: { users: { where: { AND: [{}, { schoolId: 'school-a' }] } } },
    });
  });

  it('lets a bypassed request keep an unscoped nested include', async () => {
    const handler = tenantGuardOperationHandler(tenantContext);
    const query = jest.fn().mockResolvedValue('ok');

    await tenantContext.run(() => {
      tenantContext.populate(null, true);
      return handler({ model: 'School', operation: 'findMany', args: { include: { users: true } }, query });
    });

    expect(query).toHaveBeenCalledWith({ include: { users: true } });
  });

  it('refuses a nested include it cannot filter rather than returning it unscoped', async () => {
    const handler = tenantGuardOperationHandler(tenantContext);
    const query = jest.fn().mockResolvedValue('ok');

    await expect(
      tenantContext.run(() => {
        tenantContext.populate('school-a', false);
        return handler({ model: 'RefreshToken', operation: 'findMany', args: { include: { user: true } }, query });
      }),
    ).rejects.toBeInstanceOf(UnsupportedTenantNestedOperationError);
    expect(query).not.toHaveBeenCalled();
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
