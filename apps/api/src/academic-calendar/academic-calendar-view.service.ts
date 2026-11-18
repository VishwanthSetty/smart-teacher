import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { AcademicCalendarStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { actorScopeOf } from '../common/authorization/resource-access';
import {
  daysBetween,
  formatDateOnly,
  parseDateOnly,
  todayDateOnly,
} from './academic-calendar-dates.util';
import { AcademicCalendarScopeService, pairKey } from './academic-calendar-scope.service';
import { AcademicYearsService } from './academic-years.service';
import { CALENDAR_ENTRY_ORDER, CALENDAR_ENTRY_SELECT } from './platform-academic-calendars.service';
import { ViewAcademicCalendarQueryDto } from './dto/view-academic-calendar-query.dto';
import type { AcademicYearRow } from './entities/academic-year.entity';
import { AcademicYearEntity } from './entities/academic-year.entity';
import {
  AcademicCalendarSource,
  type AcademicCalendarViewEntity,
  type AcademicCalendarViewEntryEntity,
  type CalendarPairEntity,
} from './entities/academic-calendar-view.entity';

// Longer than any academic year, so "the whole year" is always one request, while still
// bounding what a single read can pull.
export const MAX_VIEW_RANGE_DAYS = 400;

// What a teacher, student or school admin sees. For each (grade, subject) the actor may
// browse: the school's PUBLISHED calendar if one exists, otherwise the platform's
// PUBLISHED default, otherwise nothing. A school that opted out for the year sees an
// empty calendar. Drafts — default or school — never reach this read.
@Injectable()
export class AcademicCalendarViewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly years: AcademicYearsService,
    private readonly scope: AcademicCalendarScopeService,
  ) {}

  // The pickers' source: every pair this actor may view, whether or not a plan exists yet.
  browsePairs(actor: AuthenticatedUser): Promise<CalendarPairEntity[]> {
    return this.scope.browsePairs(actorScopeOf(actor));
  }

  async view(actor: AuthenticatedUser, query: ViewAcademicCalendarQueryDto): Promise<AcademicCalendarViewEntity> {
    const year = await this.resolveYear(query);
    const { from, to } = resolveRange(year, query);
    const base = {
      academicYear: AcademicYearEntity.fromModel(year),
      from: formatDateOnly(from),
      to: formatDateOnly(to),
    };

    const setting = await this.prisma.schoolAcademicCalendarSetting.findFirst({
      where: { academicYearId: year.id },
      select: { isEnabled: true },
    });
    if (setting?.isEnabled === false) {
      return { ...base, isEnabled: false, entries: [] };
    }

    const pairs = (await this.scope.browsePairs(actorScopeOf(actor))).filter(
      (pair) =>
        (query.gradeLevelId === undefined || pair.gradeLevel.id === query.gradeLevelId) &&
        (query.subjectId === undefined || pair.subject.id === query.subjectId),
    );
    if (pairs.length === 0) {
      return { ...base, isEnabled: true, entries: [] };
    }

    const pairFilter = pairs.map((pair) => ({ gradeLevelId: pair.gradeLevel.id, subjectId: pair.subject.id }));
    const pairsByKey = new Map(pairs.map((pair) => [pairKey(pair.gradeLevel.id, pair.subject.id), pair]));
    const entryWindow = {
      where: { date: { gte: from, lte: to } },
      select: CALENDAR_ENTRY_SELECT,
      orderBy: [...CALENDAR_ENTRY_ORDER],
    };

    const schoolCalendars = await this.prisma.schoolAcademicCalendar.findMany({
      where: { academicYearId: year.id, status: AcademicCalendarStatus.PUBLISHED, OR: pairFilter },
      select: { gradeLevelId: true, subjectId: true, entries: entryWindow },
    });

    // Only a PUBLISHED school calendar overrides; a draft leaves the default in place.
    const overridden = new Set(schoolCalendars.map((c) => pairKey(c.gradeLevelId, c.subjectId)));
    const remaining = pairFilter.filter((pair) => !overridden.has(pairKey(pair.gradeLevelId, pair.subjectId)));

    const platformCalendars =
      remaining.length === 0
        ? []
        : await this.prisma.platformAcademicCalendar.findMany({
            where: { academicYearId: year.id, status: AcademicCalendarStatus.PUBLISHED, OR: remaining },
            select: { gradeLevelId: true, subjectId: true, entries: entryWindow },
          });

    const entries: AcademicCalendarViewEntryEntity[] = [];
    const collect = (
      calendars: typeof schoolCalendars,
      source: AcademicCalendarSource,
    ): void => {
      for (const calendar of calendars) {
        const pair = pairsByKey.get(pairKey(calendar.gradeLevelId, calendar.subjectId));
        if (pair === undefined) {
          continue;
        }
        for (const entry of calendar.entries) {
          entries.push({
            id: entry.id,
            date: formatDateOnly(entry.date),
            title: entry.title,
            description: entry.description,
            source,
            gradeLevel: pair.gradeLevel,
            subject: pair.subject,
          });
        }
      }
    };
    collect(schoolCalendars, AcademicCalendarSource.SCHOOL);
    collect(platformCalendars, AcademicCalendarSource.PLATFORM);

    // Stable sort: within a day, entries keep their per-calendar planned order, and
    // calendars follow the pair order (grade rank, then subject name).
    const pairOrder = new Map(pairs.map((pair, index) => [pairKey(pair.gradeLevel.id, pair.subject.id), index]));
    entries.sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        (pairOrder.get(pairKey(a.gradeLevel.id, a.subject.id)) ?? 0) -
          (pairOrder.get(pairKey(b.gradeLevel.id, b.subject.id)) ?? 0),
    );

    return { ...base, isEnabled: true, entries };
  }

  private async resolveYear(query: ViewAcademicCalendarQueryDto): Promise<AcademicYearRow> {
    if (query.academicYearId !== undefined) {
      return this.years.getOrThrow(query.academicYearId);
    }
    const anchor = query.from === undefined ? todayDateOnly() : parseDateOnly(query.from);
    const year = await this.years.findContaining(anchor);
    if (year === null) {
      throw new NotFoundException(`No academic year covers ${formatDateOnly(anchor)}`);
    }
    return year;
  }
}

// Clamped to the year: a window that runs past either end simply shows the part of the
// year it overlaps, rather than failing a month view that straddles the year boundary.
function resolveRange(year: AcademicYearRow, query: ViewAcademicCalendarQueryDto): { from: Date; to: Date } {
  const requestedFrom = query.from === undefined ? year.startDate : parseDateOnly(query.from);
  const requestedTo = query.to === undefined ? year.endDate : parseDateOnly(query.to);
  if (requestedFrom.getTime() > requestedTo.getTime()) {
    throw new UnprocessableEntityException('from must not be after to');
  }
  if (daysBetween(requestedFrom, requestedTo) > MAX_VIEW_RANGE_DAYS) {
    throw new UnprocessableEntityException(`The range may span at most ${MAX_VIEW_RANGE_DAYS} days`);
  }

  const from = requestedFrom.getTime() < year.startDate.getTime() ? year.startDate : requestedFrom;
  const to = requestedTo.getTime() > year.endDate.getTime() ? year.endDate : requestedTo;
  return { from, to };
}
