import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsString, Matches } from 'class-validator';
import { DATE_ONLY_PATTERN } from '../academic-calendar-dates.util';

export class ViewAcademicCalendarQueryDto {
  @ApiProperty({
    required: false,
    description: 'Defaults to the academic year containing `from`, or today when `from` is omitted.',
  })
  @IsOptional()
  @IsString()
  academicYearId?: string;

  @ApiProperty({ required: false, example: '2026-11-01', description: 'Inclusive. Defaults to the year start.' })
  @IsOptional()
  @Matches(DATE_ONLY_PATTERN, { message: 'from must be YYYY-MM-DD' })
  @IsISO8601({ strict: true })
  from?: string;

  @ApiProperty({ required: false, example: '2026-11-30', description: 'Inclusive. Defaults to the year end.' })
  @IsOptional()
  @Matches(DATE_ONLY_PATTERN, { message: 'to must be YYYY-MM-DD' })
  @IsISO8601({ strict: true })
  to?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  gradeLevelId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  subjectId?: string;
}
