import { Role } from '@prisma/client';
import type { ActorScope } from '../common/authorization/resource-access';
import { UsersAccessPolicy } from './users-access.policy';

describe('UsersAccessPolicy', () => {
  const policy = new UsersAccessPolicy();

  it('allows a teacher to read their own record', () => {
    const actor: ActorScope = { userId: 'u1', role: Role.TEACHER, schoolId: 's1' };
    expect(policy.canRead(actor, { id: 'u1' })).toBe(true);
  });

  it('denies a teacher reading another user', () => {
    const actor: ActorScope = { userId: 'u1', role: Role.TEACHER, schoolId: 's1' };
    expect(policy.canRead(actor, { id: 'u2' })).toBe(false);
  });

  it('denies a student reading another student', () => {
    const actor: ActorScope = { userId: 'u1', role: Role.STUDENT, schoolId: 's1' };
    expect(policy.canRead(actor, { id: 'u2' })).toBe(false);
  });

  it('allows a SCHOOL_ADMIN to read another user', () => {
    const actor: ActorScope = { userId: 'admin-1', role: Role.SCHOOL_ADMIN, schoolId: 's1' };
    expect(policy.canRead(actor, { id: 'u2' })).toBe(true);
  });
});
