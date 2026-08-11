import { Injectable } from '@nestjs/common';
import { ActorContentScopeService } from '../entitlements/actor-content-scope.service';
import type { ActorScope, ResourceAccessPolicy } from '../common/authorization/resource-access';

export interface EntitleableDocument { curriculumId: string }

@Injectable()
export class DocumentsAccessPolicy implements ResourceAccessPolicy<EntitleableDocument> {
  constructor(private readonly contentScope: ActorContentScopeService) {}

  canRead(actor: ActorScope, document: EntitleableDocument): Promise<boolean> {
    return this.contentScope.includes(actor, document.curriculumId);
  }
}
