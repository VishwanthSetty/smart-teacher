import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class AddStudentEnrollmentDto {
  @ApiProperty({ description: 'Section to add the student to, alongside their existing classes' })
  @IsString()
  @IsNotEmpty()
  sectionId!: string;

  @ApiProperty({ example: '12', required: false, description: 'Unique within the chosen section' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  rollNumber?: string;
}
