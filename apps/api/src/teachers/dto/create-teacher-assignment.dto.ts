import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateTeacherAssignmentDto {
  @ApiProperty({ description: 'User id of the teacher being assigned' })
  @IsString()
  @IsNotEmpty()
  teacherId!: string;

  @ApiProperty({ description: 'Subject the teacher is assigned to teach' })
  @IsString()
  @IsNotEmpty()
  subjectId!: string;

  @ApiProperty({
    required: false,
    description:
      'Section this assignment is pinned to. Omit for a school-wide "qualified to teach" ' +
      'grant with no section — the shape the teacher CSV import produces.',
  })
  @IsOptional()
  @IsString()
  sectionId?: string;

  @ApiProperty({ required: false, description: 'Grade taught; derived from section when present' })
  @IsOptional()
  @IsString()
  gradeLevelId?: string;
}
