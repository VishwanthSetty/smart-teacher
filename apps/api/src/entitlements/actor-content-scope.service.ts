import { Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { ContentEntitlementsService, type EntitledPair } from './content-entitlements.service';
import { EnrollmentsService } from '../students/enrollments.service';
import type { ActorScope } from '../common/authorization/resource-access';

// 'all' is the platform library, not "every pair" — SUPER_ADMIN authors the content and
// belongs to no school, so there is no entitlement set to enumerate for them. Callers
// must branch on it rather than treating an empty array as unrestricted.
export type ContentScope = 'all' | EntitledPair[];

// The single place that answers "which (gradeLevel, subject) pairs may this actor
// reach?". Every content read goes through here so the answer cannot drift between the
// one-row check and the list query.
//
// F-06 specifies a further narrowing for TEACHER — only the pairs they teach. F-08 gave
// TeacherAssignment a sectionId, but the narrowing itself is a deliberate follow-up
// rather than bundled here: every teacher still resolves to the school's full
// entitlement set until it lands, so an admin who hasn't backfilled assignments yet
// doesn't lose access to content their school is entitled to.
@Injectable()
export class ActorContentScopeService {
  constructor(
    private readonly entitlements: ContentEntitlementsService,
    private readonly enrollments: EnrollmentsService,
  ) {}

  async resolve(actor: ActorScope): Promise<ContentScope> {
    if (actor.role === Role.SUPER_ADMIN) {
      return 'all';
    }

    // No school id is passed, and none should be: the tenant guard scopes this read to
    // the caller's own school, so there is no parameter a caller could get wrong.
    const pairs = await this.entitlements.listEntitledPairs();

    // A student sees only their enrolled section's grade level, intersected with the
    // school's entitlements. No active enrollment means no content — failing open here
    // would hand an unplaced student the whole school library.
    if (actor.role === Role.STUDENT) {
      const gradeLevelId = await this.enrollments.activeGradeLevelIdFor(actor.userId);
      if (!gradeLevelId) {
        return [];
      }
      return pairs.filter((pair) => pair.gradeLevelId === gradeLevelId);
    }

    return pairs;
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
