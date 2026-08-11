import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ListTeacherAssignmentsQueryDto {
  @ApiProperty({ required: false, description: 'Filter to one teacher (user id)' })
  @IsOptional()
  @IsString()
  teacherId?: string;

  @ApiProperty({ required: false, description: 'Filter to one section' })
  @IsOptional()
  @IsString()
  sectionId?: string;

  @ApiProperty({ required: false, description: 'Filter to one subject' })
  @IsOptional()
  @IsString()
  subjectId?: string;

  @ApiProperty({ required: false, description: 'Filter to one grade level' })
  @IsOptional()
  @IsString()
  gradeLevelId?: string;
}
