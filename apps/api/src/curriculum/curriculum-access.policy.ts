import { Injectable } from '@nestjs/common';
import { ActorContentScopeService } from '../entitlements/actor-content-scope.service';
import type { ActorScope, ResourceAccessPolicy } from '../common/authorization/resource-access';

export interface EntitleableCurriculum {
  id: string;
}

// Curricula are platform-global, so the tenant guard has nothing to scope them by. This
// policy stands in for that: a caller may read a curriculum only if it falls inside their
// content scope. Paired with `requireReadable`, an out-of-scope read is a 404 — the same
// don't-confirm-existence rule as a cross-tenant miss, and the same rule VideosAccessPolicy
// applies one level down.
//
// The scope decision lives in ActorContentScopeService, shared with the list path, so a
// curriculum that disappears from the list can never still be readable by id. Unpublished
// curricula are already excluded there, which is why this policy says nothing about status.
@Injectable()
export class CurriculumAccessPolicy implements ResourceAccessPolicy<EntitleableCurriculum> {
  constructor(private readonly contentScope: ActorContentScopeService) {}

  canRead(actor: ActorScope, curriculum: EntitleableCurriculum): Promise<boolean> {
    return this.contentScope.includes(actor, curriculum.id);
  }
}
