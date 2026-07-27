import { Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { ContentEntitlementsService, type EntitledPair } from './content-entitlements.service';
import type { ActorScope } from '../common/authorization/resource-access';

// 'all' is the platform library, not "every pair" — SUPER_ADMIN authors the content and
// belongs to no school, so there is no entitlement set to enumerate for them. Callers
// must branch on it rather than treating an empty array as unrestricted.
export type ContentScope = 'all' | EntitledPair[];

// The single place that answers "which (gradeLevel, subject) pairs may this actor
// reach?". Every content read goes through here so the answer cannot drift between the
// one-row check and the list query.
//
// F-06 specifies a narrowing this cannot yet perform: a TEACHER should see only the
// pairs they teach, and a STUDENT only their enrolled section's grade level, each
// intersected with the school's entitlements. Both need F-08's assignment/enrollment
// models, which do not exist — so today every in-school role resolves to the school's
// full entitlement set, which is deliberately broader than the ticket's final target.
// When F-08 lands, narrow inside `resolve` and every content read narrows with it.
@Injectable()
export class ActorContentScopeService {
  constructor(private readonly entitlements: ContentEntitlementsService) {}

  async resolve(actor: ActorScope): Promise<ContentScope> {
    if (actor.role === Role.SUPER_ADMIN) {
      return 'all';
    }

    // No school id is passed, and none should be: the tenant guard scopes this read to
    // the caller's own school, so there is no parameter a caller could get wrong.
    return this.entitlements.listEntitledPairs();
  }

  // Deliberately derived from `resolve` rather than asking ContentEntitlementsService
  // directly. A cheaper `isEntitled` count would answer the school-level question
  // correctly today but would silently skip whatever per-actor narrowing F-08 adds to
  // `resolve` — leaving single-video reads wider than list reads. One seam, one answer.
  async includes(actor: ActorScope, gradeLevelId: string, subjectId: string): Promise<boolean> {
    const scope = await this.resolve(actor);
    if (scope === 'all') {
      return true;
    }

    return scope.some((pair) => pair.gradeLevelId === gradeLevelId && pair.subjectId === subjectId);
  }
}
