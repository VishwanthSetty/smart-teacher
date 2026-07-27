import {
  MissingTenantContextError,
  TenantMismatchError,
  UnsupportedTenantNestedOperationError,
  UnsupportedTenantOperationError,
} from './tenant-guard.errors';
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

// Prisma dispatches a query under its *root* model only, so School.include.users would
// otherwise return every tenant's users. These cover the relation hops the root-level
// rules above never see.
describe('applyTenantScope — nested relations', () => {
  describe('reads', () => {
    it('scopes a to-many include hanging off a non-tenant-scoped root', () => {
      const result = applyTenantScope(
        'School',
        'findUnique',
        { where: { id: 'school-b' }, include: { users: true } },
        SCHOOL_A,
      );

      expect(result.include).toEqual({ users: { where: { AND: [{}, { schoolId: SCHOOL_A }] } } });
    });

    it('preserves an existing nested where instead of replacing it', () => {
      const result = applyTenantScope(
        'School',
        'findMany',
        { include: { users: { where: { role: 'SCHOOL_ADMIN' } } } },
        SCHOOL_A,
      );

      expect(result.include).toEqual({
        users: { where: { AND: [{ role: 'SCHOOL_ADMIN' }, { schoolId: SCHOOL_A }] } },
      });
    });

    it('scopes a relation reached through select just as it does through include', () => {
      const result = applyTenantScope('School', 'findMany', { select: { users: true } }, SCHOOL_A);

      expect(result.select).toEqual({ users: { where: { AND: [{}, { schoolId: SCHOOL_A }] } } });
    });

    it('leaves a relation into a non-tenant-scoped model exactly as written', () => {
      const result = applyTenantScope(
        'User',
        'findUnique',
        { where: { id: 'user-1' }, include: { school: true } },
        SCHOOL_A,
      );

      expect(result.include).toEqual({ school: true });
    });

    it('rejects a to-one include into a tenant-scoped model, which takes no where to filter on', () => {
      expect(() =>
        applyTenantScope('RefreshToken', 'findMany', { include: { user: true } }, SCHOOL_A),
      ).toThrow(UnsupportedTenantNestedOperationError);
    });

    it('scopes an existential relation filter inside where', () => {
      const result = applyTenantScope(
        'School',
        'findMany',
        { where: { users: { some: { email: 'rival@example.com' } } } },
        SCHOOL_A,
      );

      expect(result.where).toEqual({
        users: { some: { AND: [{ email: 'rival@example.com' }, { schoolId: SCHOOL_A }] } },
      });
    });

    it('rejects an `every` relation filter, which AND-ing schoolId would silently reinterpret', () => {
      expect(() =>
        applyTenantScope('School', 'findMany', { where: { users: { every: { role: 'TEACHER' } } } }, SCHOOL_A),
      ).toThrow(UnsupportedTenantNestedOperationError);
    });

    it('demands a tenant only once a query actually reaches a tenant-scoped relation', () => {
      expect(() => applyTenantScope('School', 'findMany', { where: { slug: 'demo' } }, null)).not.toThrow();

      expect(() => applyTenantScope('School', 'findMany', { include: { users: true } }, null)).toThrow(
        MissingTenantContextError,
      );
    });
  });

  describe('writes', () => {
    // A nested write takes its tenant from the row it hangs off. With a non-tenant-scoped
    // parent the guard cannot pin that row down — `where: { id: <school B> }` is a
    // perfectly valid School filter — so there is no rewrite that makes the child safe.
    it.each(['create', 'createMany', 'connect', 'connectOrCreate', 'update', 'updateMany', 'deleteMany'])(
      'refuses a nested %s into a tenant-scoped model from a parent that is not tenant-scoped',
      (verb) => {
        expect(() =>
          applyTenantScope(
            'School',
            'update',
            { where: { id: 'school-b' }, data: { users: { [verb]: { id: 'user-1' } } } },
            SCHOOL_A,
          ),
        ).toThrow(UnsupportedTenantNestedOperationError);
      },
    );

    it('still refuses the nested write when the parent happens to be the current tenant', () => {
      // The guard rewrites args; it cannot read the database to learn which school the
      // parent row is. Allowing this shape based on the literal in `where` would be a
      // rule that holds only for the simplest possible filter.
      expect(() =>
        applyTenantScope(
          'School',
          'update',
          { where: { id: SCHOOL_A }, data: { users: { create: [{ email: 'a@b.com' }] } } },
          SCHOOL_A,
        ),
      ).toThrow(UnsupportedTenantNestedOperationError);
    });

    it('leaves the school relation itself to the root mismatch check', () => {
      const result = applyTenantScope(
        'User',
        'create',
        { data: { email: 'a@b.com', school: { connect: { id: SCHOOL_A } } } },
        SCHOOL_A,
      );

      expect(result.data).toEqual({ email: 'a@b.com', school: { connect: { id: SCHOOL_A } } });
    });

    it('leaves a nested write into a non-tenant-scoped model untouched', () => {
      const result = applyTenantScope(
        'User',
        'update',
        { where: { id: 'user-1' }, data: { refreshTokens: { deleteMany: {} } } },
        SCHOOL_A,
      );

      expect(result.data).toEqual({ refreshTokens: { deleteMany: {} } });
    });
  });
});
