import { ApiProperty } from '@nestjs/swagger';
import { AcademicCalendarStatus } from '@prisma/client';
import { AcademicYearEntity } from './academic-year.entity';
import { CalendarGradeLevelEntity, CalendarSubjectEntity } from './academic-calendar.entity';
import { AcademicCalendarSource } from './academic-calendar-view.entity';

export class DefaultCalendarRefEntity {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  entryCount!: number;
}

export class SchoolCalendarRefEntity {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: AcademicCalendarStatus })
  status!: AcademicCalendarStatus;

  @ApiProperty()
  entryCount!: number;
}

export class SchoolCalendarOverviewRowEntity {
  @ApiProperty({ type: CalendarGradeLevelEntity })
  gradeLevel!: CalendarGradeLevelEntity;

  @ApiProperty({ type: CalendarSubjectEntity })
  subject!: CalendarSubjectEntity;

  @ApiProperty({
    type: DefaultCalendarRefEntity,
    nullable: true,
    description: 'The published platform default for this pair, if any.',
  })
  defaultCalendar!: DefaultCalendarRefEntity | null;

  @ApiProperty({ type: SchoolCalendarRefEntity, nullable: true })
  schoolCalendar!: SchoolCalendarRefEntity | null;

  @ApiProperty({
    enum: AcademicCalendarSource,
    nullable: true,
    description: 'What teachers and students see for this pair; null when neither plan is published.',
  })
  effectiveSource!: AcademicCalendarSource | null;
}

export class SchoolCalendarOverviewEntity {
  @ApiProperty({ type: AcademicYearEntity })
  academicYear!: AcademicYearEntity;

  @ApiProperty()
  isEnabled!: boolean;

  @ApiProperty({ type: [SchoolCalendarOverviewRowEntity] })
  rows!: SchoolCalendarOverviewRowEntity[];
}

export class AcademicCalendarSettingEntity {
  @ApiProperty({ type: AcademicYearEntity })
  academicYear!: AcademicYearEntity;

  @ApiProperty()
  isEnabled!: boolean;
}
