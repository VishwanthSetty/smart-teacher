import { ApiProperty } from '@nestjs/swagger';
import { AcademicYearEntity } from './academic-year.entity';
import { CalendarGradeLevelEntity, CalendarSubjectEntity } from './academic-calendar.entity';

// Which plan an entry came from. Response-only, never stored: the source is decided at
// read time by whether the school has published its own calendar for that pair.
export enum AcademicCalendarSource {
  PLATFORM = 'PLATFORM',
  SCHOOL = 'SCHOOL',
}

export class CalendarPairEntity {
  @ApiProperty({ type: CalendarGradeLevelEntity })
  gradeLevel!: CalendarGradeLevelEntity;

  @ApiProperty({ type: CalendarSubjectEntity })
  subject!: CalendarSubjectEntity;
}

export class AcademicCalendarViewEntryEntity {
  @ApiProperty()
  id!: string;

  @ApiProperty({ example: '2026-07-14' })
  date!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ nullable: true, type: String })
  description!: string | null;

  @ApiProperty({ enum: AcademicCalendarSource })
  source!: AcademicCalendarSource;

  @ApiProperty({ type: CalendarGradeLevelEntity })
  gradeLevel!: CalendarGradeLevelEntity;

  @ApiProperty({ type: CalendarSubjectEntity })
  subject!: CalendarSubjectEntity;
}

export class AcademicCalendarViewEntity {
  @ApiProperty({ type: AcademicYearEntity })
  academicYear!: AcademicYearEntity;

  @ApiProperty({ description: 'false when the school has opted out for this year; entries is then empty.' })
  isEnabled!: boolean;

  @ApiProperty({ example: '2026-11-01' })
  from!: string;

  @ApiProperty({ example: '2026-11-30' })
  to!: string;

  @ApiProperty({ type: [AcademicCalendarViewEntryEntity], description: 'Ordered by date.' })
  entries!: AcademicCalendarViewEntryEntity[];
}
