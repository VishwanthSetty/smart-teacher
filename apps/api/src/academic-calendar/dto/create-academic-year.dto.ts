import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsISO8601, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { DATE_ONLY_PATTERN } from '../academic-calendar-dates.util';

export class CreateAcademicYearDto {
  @ApiProperty({ example: '2026-2027' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  label!: string;

  @ApiProperty({ example: '2026-06-01', description: 'YYYY-MM-DD, inclusive.' })
  @Matches(DATE_ONLY_PATTERN, { message: 'startDate must be YYYY-MM-DD' })
  @IsISO8601({ strict: true })
  startDate!: string;

  @ApiProperty({ example: '2027-03-31', description: 'YYYY-MM-DD, inclusive.' })
  @Matches(DATE_ONLY_PATTERN, { message: 'endDate must be YYYY-MM-DD' })
  @IsISO8601({ strict: true })
  endDate!: string;
}
