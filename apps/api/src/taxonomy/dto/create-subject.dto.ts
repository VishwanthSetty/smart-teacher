import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MinLength } from 'class-validator';

// Same rule as CreateSchoolDto's slug: lowercase alphanumeric segments, single hyphens.
const CODE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class CreateSubjectDto {
  @ApiProperty({ example: 'Mathematics' })
  @IsString()
  @MinLength(1)
  name!: string;

  // Set once at creation and never editable — UpdateSubjectDto deliberately omits it,
  // because every video, entitlement and timetable slot joins on this value.
  @ApiProperty({ example: 'maths' })
  @Matches(CODE_PATTERN, {
    message: 'code must be lowercase, alphanumeric, and hyphen-separated',
  })
  code!: string;
}
