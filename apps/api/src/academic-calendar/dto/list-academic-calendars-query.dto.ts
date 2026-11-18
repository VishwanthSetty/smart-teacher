import { ApiProperty } from '@nestjs/swagger';
import { AcademicCalendarStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class ListAcademicCalendarsQueryDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  academicYearId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  gradeLevelId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  subjectId?: string;

  @ApiProperty({ required: false, enum: AcademicCalendarStatus })
  @IsOptional()
  @IsEnum(AcademicCalendarStatus)
  status?: AcademicCalendarStatus;
}
