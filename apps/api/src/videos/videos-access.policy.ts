import { Injectable } from '@nestjs/common';
import { ActorContentScopeService } from '../entitlements/actor-content-scope.service';
import type { ActorScope, ResourceAccessPolicy } from '../common/authorization/resource-access';

export interface EntitleableVideo {
  // Reached through the video's content node. A curriculum is the licensing unit, so
  // this one id is the whole access decision.
  curriculumId: string;
}

// Videos are platform-global, so the tenant guard has nothing to scope them by. This
// policy is what stands in for that: a caller may read a video only if the curriculum its
// content node belongs to falls inside their content scope. Paired with
// `requireReadable`, an out-of-scope read is a 404 — the same don't-confirm-existence
// rule as a cross-tenant miss.
//
// The scope decision itself lives in ActorContentScopeService, shared with the list
// path, so a video that disappears from a list can never still be readable by id.
@Injectable()
export class VideosAccessPolicy implements ResourceAccessPolicy<EntitleableVideo> {
  constructor(private readonly contentScope: ActorContentScopeService) {}

  canRead(actor: ActorScope, video: EntitleableVideo): Promise<boolean> {
    return this.contentScope.includes(actor, video.curriculumId);
  }
}
