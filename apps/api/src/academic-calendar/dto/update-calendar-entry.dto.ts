import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsISO8601, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { DATE_ONLY_PATTERN } from '../academic-calendar-dates.util';

const trim = ({ value }: { value: unknown }): unknown => (typeof value === 'string' ? value.trim() : value);

export class UpdateCalendarEntryDto {
  @ApiProperty({ required: false, example: '2026-07-14' })
  @IsOptional()
  @Matches(DATE_ONLY_PATTERN, { message: 'date must be YYYY-MM-DD' })
  @IsISO8601({ strict: true })
  date?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  // null clears the description; omitting it leaves it unchanged.
  @ApiProperty({ required: false, nullable: true, type: String })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  description?: string | null;
}
