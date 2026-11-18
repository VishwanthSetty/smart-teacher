import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsISO8601, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { DATE_ONLY_PATTERN } from '../academic-calendar-dates.util';

const trim = ({ value }: { value: unknown }): unknown => (typeof value === 'string' ? value.trim() : value);

export class CreateCalendarEntryDto {
  @ApiProperty({ example: '2026-07-14', description: 'YYYY-MM-DD, within the academic year.' })
  @Matches(DATE_ONLY_PATTERN, { message: 'date must be YYYY-MM-DD' })
  @IsISO8601({ strict: true })
  date!: string;

  @ApiProperty({ example: 'Chapter 3 — Introduction to fractions' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  description?: string;
}
