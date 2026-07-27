import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { AnyRole, Roles } from '../decorators/roles.decorator';
import { Public } from '../decorators/public.decorator';
import type { AuthenticatedUser } from '../../auth/types/authenticated-user.interface';
import { RolesGuard } from './roles.guard';

class Fixture {
  undeclared(): void {}

  @Roles()
  empty(): void {}

  @Roles(Role.SCHOOL_ADMIN)
  adminOnly(): void {}

  @AnyRole()
  anyone(): void {}

  @Public()
  open(): void {}
}

@Roles(Role.SUPER_ADMIN)
class ClassScoped {
  inherits(): void {}

  @Roles(Role.TEACHER)
  narrows(): void {}
}

function user(role: Role): AuthenticatedUser {
  return { sub: 'u1', email: 'u1@smartteacher.dev', name: 'U1', role, schoolId: 's1' };
}

function contextFor(cls: new (...args: never[]) => object, method: string, actor?: AuthenticatedUser) {
  const handler = (cls.prototype as Record<string, () => void>)[method];
  return {
    getHandler: () => handler,
    getClass: () => cls,
    switchToHttp: () => ({ getRequest: () => ({ user: actor }) }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());

  it('denies a route with no @Roles, @AnyRole, or @Public — deny by default', () => {
    expect(guard.canActivate(contextFor(Fixture, 'undeclared', user(Role.SCHOOL_ADMIN)))).toBe(false);
  });

  it('denies an empty @Roles() list', () => {
    expect(guard.canActivate(contextFor(Fixture, 'empty', user(Role.SCHOOL_ADMIN)))).toBe(false);
  });

  it('denies when request.user is absent even though a role is declared', () => {
    expect(guard.canActivate(contextFor(Fixture, 'adminOnly', undefined))).toBe(false);
  });

  it('allows the declared role', () => {
    expect(guard.canActivate(contextFor(Fixture, 'adminOnly', user(Role.SCHOOL_ADMIN)))).toBe(true);
  });

  it.each([Role.SUPER_ADMIN, Role.TEACHER, Role.STUDENT])('denies role %s on a route scoped to SCHOOL_ADMIN', (role) => {
    expect(guard.canActivate(contextFor(Fixture, 'adminOnly', user(role)))).toBe(false);
  });

  it('allows a @Public route even with no user', () => {
    expect(guard.canActivate(contextFor(Fixture, 'open', undefined))).toBe(true);
  });

  it.each(Object.values(Role))('@AnyRole allows role %s', (role) => {
    expect(guard.canActivate(contextFor(Fixture, 'anyone', user(role)))).toBe(true);
  });

  it('a method-level @Roles overrides the class list rather than widening it', () => {
    expect(guard.canActivate(contextFor(ClassScoped, 'narrows', user(Role.TEACHER)))).toBe(true);
    expect(guard.canActivate(contextFor(ClassScoped, 'narrows', user(Role.SUPER_ADMIN)))).toBe(false);
  });

  it('a method with no metadata inherits the class-level @Roles', () => {
    expect(guard.canActivate(contextFor(ClassScoped, 'inherits', user(Role.SUPER_ADMIN)))).toBe(true);
    expect(guard.canActivate(contextFor(ClassScoped, 'inherits', user(Role.TEACHER)))).toBe(false);
  });
});
