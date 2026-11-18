import { ApiProperty } from '@nestjs/swagger';
import { formatDateOnly } from '../academic-calendar-dates.util';

export interface AcademicYearRow {
  id: string;
  label: string;
  startDate: Date;
  endDate: Date;
}

export class AcademicYearEntity {
  @ApiProperty()
  id!: string;

  @ApiProperty({ example: '2026-2027' })
  label!: string;

  @ApiProperty({ example: '2026-06-01' })
  startDate!: string;

  @ApiProperty({ example: '2027-03-31' })
  endDate!: string;

  static fromModel(year: AcademicYearRow): AcademicYearEntity {
    return {
      id: year.id,
      label: year.label,
      startDate: formatDateOnly(year.startDate),
      endDate: formatDateOnly(year.endDate),
    };
  }
}
