import { NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { ActorScope, ResourceAccessPolicy } from './resource-access';
import { requireReadable } from './resource-access';

describe('requireReadable', () => {
  const actor: ActorScope = { userId: 'u1', role: Role.TEACHER, schoolId: 's1' };
  const allow: ResourceAccessPolicy<{ id: string }> = { canRead: () => true };
  const deny: ResourceAccessPolicy<{ id: string }> = { canRead: () => false };

  it('returns the resource when the policy allows it', async () => {
    await expect(requireReadable({ id: 'r1' }, actor, allow, 'nope')).resolves.toEqual({ id: 'r1' });
  });

  it('throws 404, not 403, when the policy denies it — a 403 would confirm it exists', async () => {
    await expect(requireReadable({ id: 'r1' }, actor, deny, 'Video not found')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('throws the same 404 for a missing resource as for a forbidden one', async () => {
    const missing = await requireReadable(null, actor, allow, 'Video not found').catch((e) => e);
    const forbidden = await requireReadable({ id: 'r1' }, actor, deny, 'Video not found').catch((e) => e);

    expect(missing).toBeInstanceOf(NotFoundException);
    expect(forbidden).toBeInstanceOf(NotFoundException);
    expect(missing.getStatus()).toBe(forbidden.getStatus());
    expect(missing.message).toBe(forbidden.message);
  });

  it('awaits an async policy', async () => {
    const asyncDeny: ResourceAccessPolicy<{ id: string }> = { canRead: async () => false };

    await expect(requireReadable({ id: 'r1' }, actor, asyncDeny, 'nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
