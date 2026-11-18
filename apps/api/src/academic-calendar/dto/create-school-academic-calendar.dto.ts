import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateSchoolAcademicCalendarDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  academicYearId!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  gradeLevelId!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  subjectId!: string;

  // A snapshot, not a live link: later edits to the default never reach a school's copy,
  // so the school's plan cannot change underneath it.
  @ApiProperty({
    required: false,
    default: false,
    description: "Start from a copy of the published platform default's entries.",
  })
  @IsOptional()
  @IsBoolean()
  copyFromDefault?: boolean;
}
