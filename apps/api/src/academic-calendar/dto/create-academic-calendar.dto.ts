import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class CreateAcademicCalendarDto {
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
}
