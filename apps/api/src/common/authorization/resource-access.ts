import { NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { AuthenticatedUser } from '../../auth/types/authenticated-user.interface';

// The subject of an access decision. Narrower than AuthenticatedUser on purpose: a
// policy must not be able to branch on the caller's email or display name.
export interface ActorScope {
  readonly userId: string;
  readonly role: Role;
  readonly schoolId: string | null;
}

export function actorScopeOf(user: AuthenticatedUser): ActorScope {
  return { userId: user.sub, role: user.role, schoolId: user.schoolId };
}

// The contract each feature module implements for its own resource, in its own folder
// (e.g. videos/videos-access.policy.ts). @Injectable() in implementations, so a policy
// that needs a DB lookup (a teacher's class assignments) can constructor-inject
// PrismaService or another service like any other provider.
export interface ResourceAccessPolicy<TResource> {
  canRead(actor: ActorScope, resource: TResource): boolean | Promise<boolean>;
}

// The one behaviour worth centralising: a resource the caller isn't entitled to see is
// indistinguishable from one that doesn't exist (404, never 403 — a 403 confirms the
// resource exists). Callers pass the already-fetched row, so there is no second query
// and no duplicated notion of "the resource".
export async function requireReadable<TResource>(
  resource: TResource | null,
  actor: ActorScope,
  policy: ResourceAccessPolicy<TResource>,
  notFoundMessage: string,
): Promise<TResource> {
  if (resource === null || !(await policy.canRead(actor, resource))) {
    throw new NotFoundException(notFoundMessage);
  }
  return resource;
}
