import { TenantMismatchError, UnsupportedTenantOperationError } from './tenant-guard.errors';
import { applyTenantScope } from './tenant-scope.util';

const SCHOOL_A = 'school-a';

describe('applyTenantScope', () => {
  it.each(['findMany', 'findFirst', 'findFirstOrThrow', 'count', 'aggregate', 'groupBy', 'deleteMany'])(
    'ANDs schoolId into the where clause for %s',
    (operation) => {
      const result = applyTenantScope('User', operation, { where: { role: 'TEACHER' } }, SCHOOL_A);
      expect(result.where).toEqual({ AND: [{ role: 'TEACHER' }, { schoolId: SCHOOL_A }] });
    },
  );

  it('defaults where to {} when omitted', () => {
    const result = applyTenantScope('User', 'findMany', {}, SCHOOL_A);
    expect(result.where).toEqual({ AND: [{}, { schoolId: SCHOOL_A }] });
  });

  it.each(['findUnique', 'findUniqueOrThrow', 'delete'])(
    'folds schoolId into the unique where for %s',
    (operation) => {
      const result = applyTenantScope('User', operation, { where: { id: 'user-1' } }, SCHOOL_A);
      expect(result.where).toEqual({ id: 'user-1', schoolId: SCHOOL_A });
    },
  );

  it('rejects update data carrying a different schoolId', () => {
    expect(() =>
      applyTenantScope('User', 'update', { where: { id: 'user-1' }, data: { schoolId: 'school-b' } }, SCHOOL_A),
    ).toThrow(TenantMismatchError);
  });

  it('allows update data with no schoolId change', () => {
    const result = applyTenantScope(
      'User',
      'update',
      { where: { id: 'user-1' }, data: { name: 'New Name' } },
      SCHOOL_A,
    );
    expect(result.where).toEqual({ id: 'user-1', schoolId: SCHOOL_A });
    expect(result.data).toEqual({ name: 'New Name' });
  });

  it('rejects updateMany data carrying a different schoolId', () => {
    expect(() =>
      applyTenantScope('User', 'updateMany', { where: {}, data: { schoolId: 'school-b' } }, SCHOOL_A),
    ).toThrow(TenantMismatchError);
  });

  it('stamps schoolId on create when omitted', () => {
    const result = applyTenantScope('User', 'create', { data: { email: 'a@b.com' } }, SCHOOL_A);
    expect(result.data).toEqual({ email: 'a@b.com', schoolId: SCHOOL_A });
  });

  it('accepts create when the explicit schoolId matches', () => {
    const result = applyTenantScope(
      'User',
      'create',
      { data: { email: 'a@b.com', schoolId: SCHOOL_A } },
      SCHOOL_A,
    );
    expect(result.data).toEqual({ email: 'a@b.com', schoolId: SCHOOL_A });
  });

  it('rejects create with a mismatched explicit schoolId', () => {
    expect(() =>
      applyTenantScope('User', 'create', { data: { email: 'a@b.com', schoolId: 'school-b' } }, SCHOOL_A),
    ).toThrow(TenantMismatchError);
  });

  it('rejects create with a school.connect pointing at a different tenant', () => {
    expect(() =>
      applyTenantScope(
        'User',
        'create',
        { data: { email: 'a@b.com', school: { connect: { id: 'school-b' } } } },
        SCHOOL_A,
      ),
    ).toThrow(TenantMismatchError);
  });

  it('stamps every row on createMany and rejects any mismatched row', () => {
    const result = applyTenantScope(
      'User',
      'createMany',
      { data: [{ email: 'a@b.com' }, { email: 'c@d.com', schoolId: SCHOOL_A }] },
      SCHOOL_A,
    );
    expect(result.data).toEqual([
      { email: 'a@b.com', schoolId: SCHOOL_A },
      { email: 'c@d.com', schoolId: SCHOOL_A },
    ]);

    expect(() =>
      applyTenantScope('User', 'createMany', { data: [{ email: 'a@b.com', schoolId: 'school-b' }] }, SCHOOL_A),
    ).toThrow(TenantMismatchError);
  });

  it('scopes upsert where, stamps create, and rejects a mismatched update.schoolId', () => {
    const result = applyTenantScope(
      'User',
      'upsert',
      { where: { id: 'user-1' }, create: { email: 'a@b.com' }, update: { name: 'New' } },
      SCHOOL_A,
    );
    expect(result.where).toEqual({ id: 'user-1', schoolId: SCHOOL_A });
    expect(result.create).toEqual({ email: 'a@b.com', schoolId: SCHOOL_A });

    expect(() =>
      applyTenantScope(
        'User',
        'upsert',
        { where: { id: 'user-1' }, create: {}, update: { schoolId: 'school-b' } },
        SCHOOL_A,
      ),
    ).toThrow(TenantMismatchError);
  });

  it('throws UnsupportedTenantOperationError for an operation it does not recognize', () => {
    expect(() => applyTenantScope('User', 'fields', {}, SCHOOL_A)).toThrow(UnsupportedTenantOperationError);
  });
});
