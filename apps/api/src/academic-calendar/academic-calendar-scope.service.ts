import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { ActorScope } from '../common/authorization/resource-access';
import { ActorContentScopeService, type ContentScope } from '../entitlements/actor-content-scope.service';
import type { CalendarPairEntity } from './entities/academic-calendar-view.entity';

const PAIR_SELECT = {
  gradeLevel: { select: { id: true, name: true, rank: true } },
  subject: { select: { id: true, name: true, code: true } },
} as const satisfies Prisma.CurriculumSelect;

export function pairKey(gradeLevelId: string, subjectId: string): string {
  return `${gradeLevelId}:${subjectId}`;
}

// Translates the content scope into the (grade, subject) pairs calendars key on. It adds
// no rule of its own: a calendar is reachable exactly when some curriculum for the same
// pair is, so entitlement, the student's class and the teacher's assignments all narrow
// calendars the same way they narrow videos.
@Injectable()
export class AcademicCalendarScopeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contentScope: ActorContentScopeService,
  ) {}

  // AUTHORIZATION: the pairs the actor may author or open.
  async authorizedPairs(actor: ActorScope): Promise<CalendarPairEntity[]> {
    return this.pairsFor(await this.contentScope.resolve(actor));
  }

  // PRESENTATION: the pairs list reads show. A STUDENT is narrowed to their current class.
  async browsePairs(actor: ActorScope): Promise<CalendarPairEntity[]> {
    return this.pairsFor(await this.contentScope.resolveBrowse(actor));
  }

  async isAuthorized(actor: ActorScope, gradeLevelId: string, subjectId: string): Promise<boolean> {
    const pairs = await this.authorizedPairs(actor);
    return pairs.some((pair) => pair.gradeLevel.id === gradeLevelId && pair.subject.id === subjectId);
  }

  private async pairsFor(scope: ContentScope): Promise<CalendarPairEntity[]> {
    if (scope !== 'all' && scope.length === 0) {
      return [];
    }

    const curricula = await this.prisma.curriculum.findMany({
      where: scope === 'all' ? {} : { id: { in: scope } },
      select: PAIR_SELECT,
    });

    // A pair may have both a STUDENT and a TEACHER curriculum; the calendar is one per pair.
    const byKey = new Map<string, CalendarPairEntity>();
    for (const curriculum of curricula) {
      byKey.set(pairKey(curriculum.gradeLevel.id, curriculum.subject.id), {
        gradeLevel: curriculum.gradeLevel,
        subject: curriculum.subject,
      });
    }

    return [...byKey.values()].sort(
      (a, b) => a.gradeLevel.rank - b.gradeLevel.rank || a.subject.name.localeCompare(b.subject.name),
    );
  }
}
