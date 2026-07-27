import { ApiProperty } from '@nestjs/swagger';
import { SubjectStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

// No `code` field, deliberately: it is the canonical key videos, entitlements and
// timetable slots join on, so editing it would silently re-point every reference.
// Same reason UpdateSchoolDto omits `slug`.
export class UpdateSubjectDto {
  @ApiProperty({ example: 'Mathematics', required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiProperty({ enum: SubjectStatus, required: false })
  @IsOptional()
  @IsEnum(SubjectStatus)
  status?: SubjectStatus;
}
