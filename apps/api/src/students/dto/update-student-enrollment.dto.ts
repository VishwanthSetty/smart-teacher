import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class UpdateStudentEnrollmentDto {
  @ApiProperty({
    example: '12',
    description: 'Unique within the enrolled section. Send an empty string to clear it.',
  })
  @IsString()
  @MaxLength(20)
  rollNumber!: string;
}
