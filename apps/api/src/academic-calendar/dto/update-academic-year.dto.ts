import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsISO8601, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { DATE_ONLY_PATTERN } from '../academic-calendar-dates.util';

export class UpdateAcademicYearDto {
  @ApiProperty({ required: false, example: '2026-2027' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  label?: string;

  @ApiProperty({ required: false, example: '2026-06-01' })
  @IsOptional()
  @Matches(DATE_ONLY_PATTERN, { message: 'startDate must be YYYY-MM-DD' })
  @IsISO8601({ strict: true })
  startDate?: string;

  @ApiProperty({ required: false, example: '2027-03-31' })
  @IsOptional()
  @Matches(DATE_ONLY_PATTERN, { message: 'endDate must be YYYY-MM-DD' })
  @IsISO8601({ strict: true })
  endDate?: string;
}
