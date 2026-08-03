import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateStudentDto {
  @ApiProperty({ example: 'Asha' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  firstName!: string;

  @ApiProperty({ example: 'Rao' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  lastName!: string;

  @ApiProperty({ example: 'asha.rao@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: '12', required: false, description: 'Unique within the chosen section' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  rollNumber?: string;

  @ApiProperty({ description: 'Section to enroll the student into' })
  @IsString()
  @IsNotEmpty()
  sectionId!: string;
}
