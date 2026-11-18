import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AcademicCalendarStatus, Prisma, SubjectStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { parseDateOnly, requireDateWithinYear } from './academic-calendar-dates.util';
import { ACADEMIC_YEAR_SELECT } from './academic-years.service';
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
import { CreateAcademicCalendarDto } from './dto/create-academic-calendar.dto';
import { CreateCalendarEntryDto } from './dto/create-calendar-entry.dto';
import { ListAcademicCalendarsQueryDto } from './dto/list-academic-calendars-query.dto';
import { UpdateCalendarEntryDto } from './dto/update-calendar-entry.dto';
import {
  AcademicCalendarDetailEntity,
  AcademicCalendarEntryEntity,
  AcademicCalendarSummaryEntity,
} from './entities/academic-calendar.entity';

export const CALENDAR_SUMMARY_SELECT = {
  id: true,
  status: true,
  publishedAt: true,
  academicYear: { select: ACADEMIC_YEAR_SELECT },
  gradeLevel: { select: { id: true, name: true, rank: true } },
  subject: { select: { id: true, name: true, code: true } },
} as const;

export const CALENDAR_ENTRY_SELECT = { id: true, date: true, title: true, description: true } as const;

// The order every entry list uses: by day, then in the order they were planned.
export const CALENDAR_ENTRY_ORDER = [{ date: 'asc' }, { createdAt: 'asc' }] as const satisfies
  Prisma.PlatformAcademicCalendarEntryOrderByWithRelationInput[];

// The SUPER_ADMIN's default calendars. Every model touched here is platform-global, so
// no route needs @BypassTenantScope(); schools reach these rows only through
// AcademicCalendarViewService and SchoolAcademicCalendarsService, which gate them by
// the school's entitlements.
@Injectable()
export class PlatformAcademicCalendarsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ListAcademicCalendarsQueryDto): Promise<AcademicCalendarSummaryEntity[]> {
    const calendars = await this.prisma.platformAcademicCalendar.findMany({
      where: {
        academicYearId: query.academicYearId,
        gradeLevelId: query.gradeLevelId,
        subjectId: query.subjectId,
        status: query.status,
      },
      select: CALENDAR_SUMMARY_SELECT,
      orderBy: [{ academicYear: { startDate: 'desc' } }, { gradeLevel: { rank: 'asc' } }, { subject: { name: 'asc' } }],
    });

    const counts = await this.entryCounts(calendars.map((calendar) => calendar.id));
    return calendars.map((calendar) =>
      AcademicCalendarSummaryEntity.fromModel(calendar, counts.get(calendar.id) ?? 0),
    );
  }

  async findOne(id: string): Promise<AcademicCalendarDetailEntity> {
    const calendar = await this.prisma.platformAcademicCalendar.findUnique({
      where: { id },
      select: {
        ...CALENDAR_SUMMARY_SELECT,
        entries: { select: CALENDAR_ENTRY_SELECT, orderBy: [...CALENDAR_ENTRY_ORDER] },
      },
    });
    if (calendar === null) {
      throw new NotFoundException('Academic calendar not found');
    }
    return AcademicCalendarDetailEntity.fromDetail(calendar);
  }

  async create(dto: CreateAcademicCalendarDto): Promise<AcademicCalendarDetailEntity> {
    const [year, gradeLevel, subject] = await Promise.all([
      this.prisma.academicYear.findUnique({ where: { id: dto.academicYearId }, select: { id: true } }),
      this.prisma.gradeLevel.findUnique({ where: { id: dto.gradeLevelId }, select: { id: true } }),
      this.prisma.subject.findUnique({ where: { id: dto.subjectId }, select: { status: true } }),
    ]);
    if (year === null || gradeLevel === null || subject === null) {
      throw new NotFoundException('Academic year, grade level or subject not found');
    }
    // A retired subject keeps its existing references but takes no new ones.
    if (subject.status === SubjectStatus.RETIRED) {
      throw new ConflictException('This subject is retired');
    }

    try {
      const created = await this.prisma.platformAcademicCalendar.create({
        data: {
          academicYearId: dto.academicYearId,
          gradeLevelId: dto.gradeLevelId,
          subjectId: dto.subjectId,
        },
        select: { id: true },
      });
      return await this.findOne(created.id);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('A default calendar already exists for this year, grade level and subject');
      }
      throw error;
    }
  }

  // Refuses an empty calendar, the same rule as publishing a curriculum: a published
  // default with no entries tells every entitled school "nothing is planned".
  async publish(id: string): Promise<AcademicCalendarDetailEntity> {
    const calendar = await this.getStateOrThrow(id);
    if (calendar.status === AcademicCalendarStatus.PUBLISHED) {
      throw new ConflictException('The calendar is already published');
    }
    if (calendar.entryCount === 0) {
      throw new ConflictException('Add at least one entry before publishing');
    }

    await this.prisma.platformAcademicCalendar.update({
      where: { id },
      data: { status: AcademicCalendarStatus.PUBLISHED, publishedAt: new Date() },
    });
    return this.findOne(id);
  }

  // Withdraws the default from every entitled school immediately.
  async unpublish(id: string): Promise<AcademicCalendarDetailEntity> {
    const calendar = await this.getStateOrThrow(id);
    if (calendar.status !== AcademicCalendarStatus.PUBLISHED) {
      throw new ConflictException('The calendar is not published');
    }

    await this.prisma.platformAcademicCalendar.update({
      where: { id },
      data: { status: AcademicCalendarStatus.DRAFT, publishedAt: null },
    });
    return this.findOne(id);
  }

  // Schools that copied this default keep their copies: a copy is a snapshot with no FK
  // back to the default.
  async remove(id: string): Promise<void> {
    await this.getStateOrThrow(id);
    await this.prisma.platformAcademicCalendar.delete({ where: { id } });
  }

  async addEntry(id: string, dto: CreateCalendarEntryDto): Promise<AcademicCalendarEntryEntity> {
    const calendar = await this.getWithYearOrThrow(id);
    const date = parseDateOnly(dto.date);
    requireDateWithinYear(date, calendar.academicYear);

    const entry = await this.prisma.platformAcademicCalendarEntry.create({
      data: { calendarId: id, date, title: dto.title, description: dto.description ?? null },
      select: CALENDAR_ENTRY_SELECT,
    });
    return AcademicCalendarEntryEntity.fromModel(entry);
  }

  async updateEntry(
    id: string,
    entryId: string,
    dto: UpdateCalendarEntryDto,
  ): Promise<AcademicCalendarEntryEntity> {
    const calendar = await this.getWithYearOrThrow(id);
    await this.getEntryOrThrow(id, entryId);

    const date = dto.date === undefined ? undefined : parseDateOnly(dto.date);
    if (date !== undefined) {
      requireDateWithinYear(date, calendar.academicYear);
    }

    const entry = await this.prisma.platformAcademicCalendarEntry.update({
      where: { id: entryId },
      data: { date, title: dto.title, description: dto.description },
      select: CALENDAR_ENTRY_SELECT,
    });
    return AcademicCalendarEntryEntity.fromModel(entry);
  }

  async removeEntry(id: string, entryId: string): Promise<void> {
    await this.getEntryOrThrow(id, entryId);
    await this.prisma.platformAcademicCalendarEntry.delete({ where: { id: entryId } });
  }

  async importTemplate(id: string): Promise<Buffer> {
    const calendar = await this.getWithYearOrThrow(id);
    return buildCalendarImportTemplate(calendar.academicYear);
  }

  async importEntries(
    id: string,
    upload: UploadedCalendarFile | undefined,
    dto: ImportCalendarEntriesDto,
  ): Promise<CalendarImportResultEntity> {
    const file = requireFile(upload);
    const calendar = await this.getWithYearOrThrow(id);
    const parsed = await parseCalendarImport(file, calendar.academicYear);
    const replaceExisting = dto.replaceExisting ?? false;
    const existing = await this.prisma.platformAcademicCalendarEntry.findMany({
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
        await tx.platformAcademicCalendarEntry.deleteMany({ where: { calendarId: id } });
      }
      if (plan.toCreate.length > 0) {
        await tx.platformAcademicCalendarEntry.createMany({
          data: plan.toCreate.map((row) => ({
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

  private async getStateOrThrow(id: string): Promise<{ status: AcademicCalendarStatus; entryCount: number }> {
    const calendar = await this.prisma.platformAcademicCalendar.findUnique({
      where: { id },
      select: { status: true },
    });
    if (calendar === null) {
      throw new NotFoundException('Academic calendar not found');
    }
    const entryCount = await this.prisma.platformAcademicCalendarEntry.count({ where: { calendarId: id } });
    return { status: calendar.status, entryCount };
  }

  private async getWithYearOrThrow(id: string) {
    const calendar = await this.prisma.platformAcademicCalendar.findUnique({
      where: { id },
      select: { id: true, academicYear: { select: ACADEMIC_YEAR_SELECT } },
    });
    if (calendar === null) {
      throw new NotFoundException('Academic calendar not found');
    }
    return calendar;
  }

  // Scoped by calendarId too, so an entry id from another calendar is a 404 rather than
  // an edit through the wrong parent.
  private async getEntryOrThrow(calendarId: string, entryId: string): Promise<void> {
    const entry = await this.prisma.platformAcademicCalendarEntry.findFirst({
      where: { id: entryId, calendarId },
      select: { id: true },
    });
    if (entry === null) {
      throw new NotFoundException('Calendar entry not found');
    }
  }

  private async entryCounts(calendarIds: string[]): Promise<Map<string, number>> {
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
