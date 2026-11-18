import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AcademicCalendarStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { actorScopeOf, requireReadable } from '../common/authorization/resource-access';
import { parseDateOnly, requireDateWithinYear } from './academic-calendar-dates.util';
import { AcademicCalendarScopeService, pairKey } from './academic-calendar-scope.service';
import { AcademicYearsService, ACADEMIC_YEAR_SELECT } from './academic-years.service';
import {
  CALENDAR_ENTRY_ORDER,
  CALENDAR_ENTRY_SELECT,
  CALENDAR_SUMMARY_SELECT,
} from './platform-academic-calendars.service';
import { SchoolAcademicCalendarAccessPolicy } from './school-academic-calendar-access.policy';
import {
  buildCalendarImportTemplate,
  importResult,
  parseCalendarImport,
  planCalendarImport,
  requireFile,
  requireImportable,
  type UploadedCalendarFile,
} from './calendar-entry-import';
import { ImportCalendarEntriesDto } from './dto/import-calendar-entries.dto';
import { CalendarImportResultEntity } from './entities/calendar-import-result.entity';
import { CreateCalendarEntryDto } from './dto/create-calendar-entry.dto';
import { CreateSchoolAcademicCalendarDto } from './dto/create-school-academic-calendar.dto';
import { UpdateCalendarEntryDto } from './dto/update-calendar-entry.dto';
import { AcademicCalendarDetailEntity, AcademicCalendarEntryEntity } from './entities/academic-calendar.entity';
import { AcademicCalendarSource } from './entities/academic-calendar-view.entity';
import { AcademicYearEntity } from './entities/academic-year.entity';
import {
  AcademicCalendarSettingEntity,
  SchoolCalendarOverviewEntity,
  type SchoolCalendarOverviewRowEntity,
} from './entities/school-calendar-overview.entity';

const NOT_FOUND = 'Academic calendar not found';

// SCHOOL_ADMIN's own calendars and the per-year opt-out. No method takes a school id:
// the tenant guard scopes every SchoolAcademicCalendar* query to the caller's school, so
// another school's calendar id is simply not found.
@Injectable()
export class SchoolAcademicCalendarsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly years: AcademicYearsService,
    private readonly scope: AcademicCalendarScopeService,
    private readonly accessPolicy: SchoolAcademicCalendarAccessPolicy,
  ) {}

  // One row per entitled pair, so the admin sees every class/subject they could plan
  // for — including those with neither a default nor their own calendar yet.
  async overview(actor: AuthenticatedUser, academicYearId: string): Promise<SchoolCalendarOverviewEntity> {
    const year = await this.years.getOrThrow(academicYearId);
    const pairs = await this.scope.authorizedPairs(actorScopeOf(actor));

    const [setting, schoolCalendars, platformCalendars] = await Promise.all([
      this.prisma.schoolAcademicCalendarSetting.findFirst({
        where: { academicYearId },
        select: { isEnabled: true },
      }),
      this.prisma.schoolAcademicCalendar.findMany({
        where: { academicYearId },
        select: { id: true, gradeLevelId: true, subjectId: true, status: true },
      }),
      this.prisma.platformAcademicCalendar.findMany({
        where: { academicYearId, status: AcademicCalendarStatus.PUBLISHED },
        select: { id: true, gradeLevelId: true, subjectId: true },
      }),
    ]);

    const [schoolCounts, platformCounts] = await Promise.all([
      this.schoolEntryCounts(schoolCalendars.map((calendar) => calendar.id)),
      this.platformEntryCounts(platformCalendars.map((calendar) => calendar.id)),
    ]);
    const schoolByPair = new Map(schoolCalendars.map((c) => [pairKey(c.gradeLevelId, c.subjectId), c]));
    const platformByPair = new Map(platformCalendars.map((c) => [pairKey(c.gradeLevelId, c.subjectId), c]));

    const rows = pairs.map((pair): SchoolCalendarOverviewRowEntity => {
      const key = pairKey(pair.gradeLevel.id, pair.subject.id);
      const own = schoolByPair.get(key);
      const platform = platformByPair.get(key);
      return {
        gradeLevel: pair.gradeLevel,
        subject: pair.subject,
        defaultCalendar: platform ? { id: platform.id, entryCount: platformCounts.get(platform.id) ?? 0 } : null,
        schoolCalendar: own
          ? { id: own.id, status: own.status, entryCount: schoolCounts.get(own.id) ?? 0 }
          : null,
        effectiveSource:
          own?.status === AcademicCalendarStatus.PUBLISHED
            ? AcademicCalendarSource.SCHOOL
            : platform
              ? AcademicCalendarSource.PLATFORM
              : null,
      };
    });

    return { academicYear: AcademicYearEntity.fromModel(year), isEnabled: setting?.isEnabled ?? true, rows };
  }

  async create(
    actor: AuthenticatedUser,
    dto: CreateSchoolAcademicCalendarDto,
  ): Promise<AcademicCalendarDetailEntity> {
    const schoolId = requireSchoolId(actor);
    await this.years.getOrThrow(dto.academicYearId);
    // Same 404 as an unknown id: an unentitled pair must not be distinguishable from a
    // grade or subject that does not exist.
    if (!(await this.scope.isAuthorized(actorScopeOf(actor), dto.gradeLevelId, dto.subjectId))) {
      throw new NotFoundException('Grade level and subject are not available to this school');
    }

    const source = dto.copyFromDefault
      ? await this.prisma.platformAcademicCalendar.findFirst({
          where: {
            academicYearId: dto.academicYearId,
            gradeLevelId: dto.gradeLevelId,
            subjectId: dto.subjectId,
            status: AcademicCalendarStatus.PUBLISHED,
          },
          select: { entries: { select: { date: true, title: true, description: true } } },
        })
      : null;
    if (dto.copyFromDefault && source === null) {
      throw new ConflictException('There is no published default calendar to copy');
    }

    try {
      const calendarId = await this.prisma.$transaction(async (tx) => {
        const calendar = await tx.schoolAcademicCalendar.create({
          data: {
            schoolId,
            academicYearId: dto.academicYearId,
            gradeLevelId: dto.gradeLevelId,
            subjectId: dto.subjectId,
          },
          select: { id: true },
        });
        if (source !== null && source.entries.length > 0) {
          await tx.schoolAcademicCalendarEntry.createMany({
            data: source.entries.map((entry) => ({
              schoolId,
              calendarId: calendar.id,
              date: entry.date,
              title: entry.title,
              description: entry.description,
            })),
          });
        }
        return calendar.id;
      });
      return await this.findOne(actor, calendarId);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('This school already has a calendar for that year, grade level and subject');
      }
      throw error;
    }
  }

  async findOne(actor: AuthenticatedUser, id: string): Promise<AcademicCalendarDetailEntity> {
    const calendar = await this.prisma.schoolAcademicCalendar.findUnique({
      where: { id },
      select: {
        ...CALENDAR_SUMMARY_SELECT,
        gradeLevelId: true,
        subjectId: true,
        entries: { select: CALENDAR_ENTRY_SELECT, orderBy: [...CALENDAR_ENTRY_ORDER] },
      },
    });
    const readable = await requireReadable<NonNullable<typeof calendar>>(
      calendar,
      actorScopeOf(actor),
      this.accessPolicy,
      NOT_FOUND,
    );
    return AcademicCalendarDetailEntity.fromDetail(readable);
  }

  // Publishing makes this calendar replace the platform default for the school's
  // teachers and students. Same non-empty rule as the default.
  async publish(actor: AuthenticatedUser, id: string): Promise<AcademicCalendarDetailEntity> {
    const calendar = await this.getReadableOrThrow(actor, id);
    if (calendar.status === AcademicCalendarStatus.PUBLISHED) {
      throw new ConflictException('The calendar is already published');
    }
    const entryCount = await this.prisma.schoolAcademicCalendarEntry.count({ where: { calendarId: id } });
    if (entryCount === 0) {
      throw new ConflictException('Add at least one entry before publishing');
    }

    await this.prisma.schoolAcademicCalendar.update({
      where: { id },
      data: { status: AcademicCalendarStatus.PUBLISHED, publishedAt: new Date() },
    });
    return this.findOne(actor, id);
  }

  // Falls back to the platform default immediately.
  async unpublish(actor: AuthenticatedUser, id: string): Promise<AcademicCalendarDetailEntity> {
    const calendar = await this.getReadableOrThrow(actor, id);
    if (calendar.status !== AcademicCalendarStatus.PUBLISHED) {
      throw new ConflictException('The calendar is not published');
    }

    await this.prisma.schoolAcademicCalendar.update({
      where: { id },
      data: { status: AcademicCalendarStatus.DRAFT, publishedAt: null },
    });
    return this.findOne(actor, id);
  }

  // "Revert to the default". Deliberately not gated by the entitlement policy: tenancy
  // alone confines it to the caller's school, and a school must always be able to
  // discard its own data — including a calendar for a pair it no longer holds.
  async remove(id: string): Promise<void> {
    const calendar = await this.prisma.schoolAcademicCalendar.findUnique({ where: { id }, select: { id: true } });
    if (calendar === null) {
      throw new NotFoundException(NOT_FOUND);
    }
    await this.prisma.schoolAcademicCalendar.delete({ where: { id } });
  }

  async addEntry(
    actor: AuthenticatedUser,
    id: string,
    dto: CreateCalendarEntryDto,
  ): Promise<AcademicCalendarEntryEntity> {
    const schoolId = requireSchoolId(actor);
    const calendar = await this.getReadableOrThrow(actor, id);
    const date = parseDateOnly(dto.date);
    requireDateWithinYear(date, calendar.academicYear);

    const entry = await this.prisma.schoolAcademicCalendarEntry.create({
      data: { schoolId, calendarId: id, date, title: dto.title, description: dto.description ?? null },
      select: CALENDAR_ENTRY_SELECT,
    });
    return AcademicCalendarEntryEntity.fromModel(entry);
  }

  async updateEntry(
    actor: AuthenticatedUser,
    id: string,
    entryId: string,
    dto: UpdateCalendarEntryDto,
  ): Promise<AcademicCalendarEntryEntity> {
    const calendar = await this.getReadableOrThrow(actor, id);
    await this.getEntryOrThrow(id, entryId);

    const date = dto.date === undefined ? undefined : parseDateOnly(dto.date);
    if (date !== undefined) {
      requireDateWithinYear(date, calendar.academicYear);
    }

    const entry = await this.prisma.schoolAcademicCalendarEntry.update({
      where: { id: entryId },
      data: { date, title: dto.title, description: dto.description },
      select: CALENDAR_ENTRY_SELECT,
    });
    return AcademicCalendarEntryEntity.fromModel(entry);
  }

  async removeEntry(actor: AuthenticatedUser, id: string, entryId: string): Promise<void> {
    await this.getReadableOrThrow(actor, id);
    await this.getEntryOrThrow(id, entryId);
    await this.prisma.schoolAcademicCalendarEntry.delete({ where: { id: entryId } });
  }

  async importTemplate(actor: AuthenticatedUser, id: string): Promise<Buffer> {
    const calendar = await this.getReadableOrThrow(actor, id);
    return buildCalendarImportTemplate(calendar.academicYear);
  }

  async importEntries(
    actor: AuthenticatedUser,
    id: string,
    upload: UploadedCalendarFile | undefined,
    dto: ImportCalendarEntriesDto,
  ): Promise<CalendarImportResultEntity> {
    const schoolId = requireSchoolId(actor);
    const file = requireFile(upload);
    const calendar = await this.getReadableOrThrow(actor, id);
    const parsed = await parseCalendarImport(file, calendar.academicYear);
    const replaceExisting = dto.replaceExisting ?? false;
    const existing = await this.prisma.schoolAcademicCalendarEntry.findMany({
      where: { calendarId: id },
      select: { date: true, title: true },
    });
    const plan = planCalendarImport(parsed, existing, replaceExisting);
    const options = { replaceExisting, existingCount: existing.length };

    if (dto.dryRun) {
      return importResult(parsed, plan, { ...options, isCommitted: false });
    }
    requireImportable(parsed);

    await this.prisma.$transaction(async (tx) => {
      if (replaceExisting) {
        await tx.schoolAcademicCalendarEntry.deleteMany({ where: { calendarId: id } });
      }
      if (plan.toCreate.length > 0) {
        await tx.schoolAcademicCalendarEntry.createMany({
          data: plan.toCreate.map((row) => ({
            schoolId,
            calendarId: id,
            date: parseDateOnly(row.date),
            title: row.title,
            description: row.description,
          })),
        });
      }
    });
    return importResult(parsed, plan, { ...options, isCommitted: true });
  }

  async listSettings(): Promise<AcademicCalendarSettingEntity[]> {
    const [years, settings] = await Promise.all([
      this.years.findAll(),
      this.prisma.schoolAcademicCalendarSetting.findMany({ select: { academicYearId: true, isEnabled: true } }),
    ]);
    const enabledByYear = new Map(settings.map((setting) => [setting.academicYearId, setting.isEnabled]));
    return years.map((academicYear) => ({
      academicYear,
      isEnabled: enabledByYear.get(academicYear.id) ?? true,
    }));
  }

  async updateSetting(
    actor: AuthenticatedUser,
    academicYearId: string,
    isEnabled: boolean,
  ): Promise<AcademicCalendarSettingEntity> {
    const schoolId = requireSchoolId(actor);
    const year = await this.years.getOrThrow(academicYearId);

    const setting = await this.prisma.schoolAcademicCalendarSetting.upsert({
      where: { schoolId_academicYearId: { schoolId, academicYearId } },
      create: { schoolId, academicYearId, isEnabled },
      update: { isEnabled },
      select: { isEnabled: true },
    });
    return { academicYear: AcademicYearEntity.fromModel(year), isEnabled: setting.isEnabled };
  }

  private async getReadableOrThrow(actor: AuthenticatedUser, id: string) {
    const calendar = await this.prisma.schoolAcademicCalendar.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        gradeLevelId: true,
        subjectId: true,
        academicYear: { select: ACADEMIC_YEAR_SELECT },
      },
    });
    return requireReadable<NonNullable<typeof calendar>>(calendar, actorScopeOf(actor), this.accessPolicy, NOT_FOUND);
  }

  private async getEntryOrThrow(calendarId: string, entryId: string): Promise<void> {
    const entry = await this.prisma.schoolAcademicCalendarEntry.findFirst({
      where: { id: entryId, calendarId },
      select: { id: true },
    });
    if (entry === null) {
      throw new NotFoundException('Calendar entry not found');
    }
  }

  private async schoolEntryCounts(calendarIds: string[]): Promise<Map<string, number>> {
    if (calendarIds.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.schoolAcademicCalendarEntry.groupBy({
      by: ['calendarId'],
      where: { calendarId: { in: calendarIds } },
      _count: { _all: true },
    });
    return new Map(rows.map((row) => [row.calendarId, row._count._all]));
  }

  private async platformEntryCounts(calendarIds: string[]): Promise<Map<string, number>> {
    if (calendarIds.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.platformAcademicCalendarEntry.groupBy({
      by: ['calendarId'],
      where: { calendarId: { in: calendarIds } },
      _count: { _all: true },
    });
    return new Map(rows.map((row) => [row.calendarId, row._count._all]));
  }
}

function requireSchoolId(actor: AuthenticatedUser): string {
  if (!actor.schoolId) {
    throw new BadRequestException('A tenant account is required');
  }
  return actor.schoolId;
}
