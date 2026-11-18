import { Injectable } from '@nestjs/common';
import type { ActorScope, ResourceAccessPolicy } from '../common/authorization/resource-access';
import { AcademicCalendarScopeService } from './academic-calendar-scope.service';

export interface SchoolCalendarPair {
  gradeLevelId: string;
  subjectId: string;
}

// Tenancy already stops another school's calendar from loading at all. This adds the
// entitlement rule: a school calendar is reachable only while the school still holds a
// published curriculum for its (grade, subject). A calendar whose entitlement was
// revoked stays in the database untouched and reappears if the grant is restored.
@Injectable()
export class SchoolAcademicCalendarAccessPolicy implements ResourceAccessPolicy<SchoolCalendarPair> {
  constructor(private readonly scope: AcademicCalendarScopeService) {}

  canRead(actor: ActorScope, calendar: SchoolCalendarPair): Promise<boolean> {
    return this.scope.isAuthorized(actor, calendar.gradeLevelId, calendar.subjectId);
  }
}
