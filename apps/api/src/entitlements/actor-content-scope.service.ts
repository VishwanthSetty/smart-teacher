import { Injectable } from '@nestjs/common';
import { ContentAudience, Role } from '@prisma/client';
import { ContentEntitlementsService } from './content-entitlements.service';
import { EnrollmentLookupService } from '../students/enrollment-lookup.service';
import type { ActorScope } from '../common/authorization/resource-access';
import { TeacherAssignmentsService } from '../teachers/teacher-assignments.service';

// 'all' is the platform library, not "every curriculum" — SUPER_ADMIN authors the content
// and belongs to no school, so there is no entitlement set to enumerate for them. Callers
// must branch on it rather than treating an empty array as unrestricted.
export type ContentScope = 'all' | string[];

// The single place that answers "which curricula may this actor reach?". Every content
// read goes through here so the answer cannot drift between the one-row check and the
// list query.
//
// A curriculum is the whole (gradeLevel, subject) tree, so this one id transitively
// decides every content node and video the actor can see. Narrowing to a subtree is a
// deliberate non-feature today: ContentNode.path would make it a prefix filter, but the
// licensing unit is the curriculum.
//
// SCHOOL_ADMIN and TEACHER currently share the fall-through branch: the school's full
// published entitlement set. F-06 specifies a further narrowing for TEACHER — only the
// subjects they teach. F-08
// gave TeacherAssignment a sectionId, but the narrowing itself is a deliberate follow-up
// rather than bundled here: every teacher still resolves to the school's full entitlement
// set until it lands, so an admin who hasn't backfilled assignments yet doesn't lose
// access to content their school is entitled to.
@Injectable()
export class ActorContentScopeService {
  constructor(
    private readonly entitlements: ContentEntitlementsService,
    private readonly enrollments: EnrollmentLookupService,
    private readonly teacherAssignments: TeacherAssignmentsService,
  ) {}

  // AUTHORIZATION scope: everything the actor may open. Policies, single-resource reads
  // and playback go through this (via `includes`). For a STUDENT it spans every class
  // they are actively enrolled in, so a task or notification for one class still opens
  // while another class is selected, and a teacher's reachability check on task create
  // does not depend on which class the student happens to have open.
  async resolve(actor: ActorScope): Promise<ContentScope> {
    return this.resolveWith(actor, async (userId) => this.enrollments.activeGradeLevelIdsFor(userId));
  }

  // PRESENTATION scope: what browse surfaces (library lists, tree, search, history,
  // bookmarks, home) show. Identical to `resolve` except that a STUDENT is narrowed to
  // the grade of the class they are currently in. Always a subset of `resolve`, so
  // nothing a list shows can be refused when opened.
  async resolveBrowse(actor: ActorScope): Promise<ContentScope> {
    return this.resolveWith(actor, async (userId) => {
      const gradeLevelId = await this.enrollments.currentGradeLevelIdFor(userId);
      return gradeLevelId ? [gradeLevelId] : [];
    });
  }

  private async resolveWith(
    actor: ActorScope,
    studentGradeLevelIds: (userId: string) => Promise<string[]>,
  ): Promise<ContentScope> {
    if (actor.role === Role.SUPER_ADMIN) {
      return 'all';
    }

    // No school id is passed, and none should be: the tenant guard scopes this read to
    // the caller's own school, so there is no parameter a caller could get wrong. The
    // list is already narrowed to PUBLISHED curricula.
    const entitled = await this.entitlements.listEntitledCurricula();

    // A student sees only their enrolled sections' grade levels, intersected with the
    // school's entitlements. No active enrollment means no content — failing open here
    // would hand an unplaced student the whole school library.
    if (actor.role === Role.STUDENT) {
      const gradeLevelIds = new Set(await studentGradeLevelIds(actor.userId));
      if (gradeLevelIds.size === 0) {
        return [];
      }
      return entitled
        .filter(
          (curriculum) =>
            curriculum.audience === ContentAudience.STUDENT &&
            gradeLevelIds.has(curriculum.gradeLevelId),
        )
        .map((curriculum) => curriculum.curriculumId);
    }

    if (actor.role === Role.TEACHER) {
      const taught = await this.teacherAssignments.taughtPairsFor(actor.userId);
      if (taught.length === 0) {
        return entitled.map((curriculum) => curriculum.curriculumId);
      }
      const pairs = new Set(taught.map((pair) => pairKey(pair.gradeLevelId, pair.subjectId)));
      return entitled
        .filter(
          (curriculum) =>
            curriculum.audience === ContentAudience.TEACHER ||
            pairs.has(pairKey(curriculum.gradeLevelId, curriculum.subjectId)),
        )
        .map((curriculum) => curriculum.curriculumId);
    }

    return entitled.map((curriculum) => curriculum.curriculumId);
  }

  // Deliberately derived from `resolve` rather than asking ContentEntitlementsService
  // directly. A cheaper `isEntitled` count would answer the school-level question
  // correctly today but would silently skip whatever per-actor narrowing `resolve` grows
  // — leaving single-video reads wider than list reads. One seam, one answer.
  async includes(actor: ActorScope, curriculumId: string): Promise<boolean> {
    const scope = await this.resolve(actor);
    if (scope === 'all') {
      return true;
    }

    return scope.includes(curriculumId);
  }
}

function pairKey(gradeLevelId: string, subjectId: string): string {
  return `${gradeLevelId}:${subjectId}`;
}
