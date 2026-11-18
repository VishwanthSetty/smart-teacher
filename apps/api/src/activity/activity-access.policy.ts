import { Injectable } from '@nestjs/common';
import type { ActorScope, ResourceAccessPolicy } from '../common/authorization/resource-access';

export interface OwnedActivityResource {
  userId?: string;
  ownerId?: string;
}

@Injectable()
export class ActivityAccessPolicy implements ResourceAccessPolicy<OwnedActivityResource> {
  canRead(actor: ActorScope, resource: OwnedActivityResource): boolean {
    return (resource.userId ?? resource.ownerId) === actor.userId;
  }
}
