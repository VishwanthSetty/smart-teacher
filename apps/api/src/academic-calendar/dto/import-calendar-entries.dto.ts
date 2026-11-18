import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

// Multipart text fields arrive as strings, so 'true' / 'false' are mapped explicitly;
// anything else is left for @IsBoolean to reject.
const toBoolean = ({ value }: { value: unknown }): unknown =>
  value === 'true' ? true : value === 'false' ? false : value;

export class ImportCalendarEntriesDto {
  @ApiProperty({
    required: false,
    default: false,
    description: 'Validate and preview only; nothing is written.',
  })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  dryRun?: boolean;

  @ApiProperty({
    required: false,
    default: false,
    description: "Delete the calendar's existing entries and replace them with the file's.",
  })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  replaceExisting?: boolean;
}
