import { ApiProperty } from '@nestjs/swagger';
import { AcademicCalendarStatus } from '@prisma/client';
import { formatDateOnly } from '../academic-calendar-dates.util';
import { AcademicYearEntity, type AcademicYearRow } from './academic-year.entity';

export class CalendarGradeLevelEntity {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  rank!: number;
}

export class CalendarSubjectEntity {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ example: 'maths' })
  code!: string;
}

export interface CalendarEntryRow {
  id: string;
  date: Date;
  title: string;
  description: string | null;
}

export class AcademicCalendarEntryEntity {
  @ApiProperty()
  id!: string;

  @ApiProperty({ example: '2026-07-14' })
  date!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ nullable: true, type: String })
  description!: string | null;

  static fromModel(entry: CalendarEntryRow): AcademicCalendarEntryEntity {
    return {
      id: entry.id,
      date: formatDateOnly(entry.date),
      title: entry.title,
      description: entry.description,
    };
  }
}

export interface CalendarSummaryRow {
  id: string;
  status: AcademicCalendarStatus;
  publishedAt: Date | null;
  academicYear: AcademicYearRow;
  gradeLevel: CalendarGradeLevelEntity;
  subject: CalendarSubjectEntity;
}

// One shape for both a platform default and a school's own calendar, so the web editor
// is a single component whichever kind it is editing.
export class AcademicCalendarSummaryEntity {
  @ApiProperty()
  id!: string;

  @ApiProperty({ type: AcademicYearEntity })
  academicYear!: AcademicYearEntity;

  @ApiProperty({ type: CalendarGradeLevelEntity })
  gradeLevel!: CalendarGradeLevelEntity;

  @ApiProperty({ type: CalendarSubjectEntity })
  subject!: CalendarSubjectEntity;

  @ApiProperty({ enum: AcademicCalendarStatus })
  status!: AcademicCalendarStatus;

  @ApiProperty({ nullable: true, type: Date })
  publishedAt!: Date | null;

  @ApiProperty()
  entryCount!: number;

  static fromModel(calendar: CalendarSummaryRow, entryCount: number): AcademicCalendarSummaryEntity {
    return {
      id: calendar.id,
      academicYear: AcademicYearEntity.fromModel(calendar.academicYear),
      gradeLevel: calendar.gradeLevel,
      subject: calendar.subject,
      status: calendar.status,
      publishedAt: calendar.publishedAt,
      entryCount,
    };
  }
}

export class AcademicCalendarDetailEntity extends AcademicCalendarSummaryEntity {
  @ApiProperty({ type: [AcademicCalendarEntryEntity], description: 'Ordered by date.' })
  entries!: AcademicCalendarEntryEntity[];

  static fromDetail(
    calendar: CalendarSummaryRow & { entries: CalendarEntryRow[] },
  ): AcademicCalendarDetailEntity {
    return {
      ...AcademicCalendarSummaryEntity.fromModel(calendar, calendar.entries.length),
      entries: calendar.entries.map((entry) => AcademicCalendarEntryEntity.fromModel(entry)),
    };
  }
}
