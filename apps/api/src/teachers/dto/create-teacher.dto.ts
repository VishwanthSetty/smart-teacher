import { ApiProperty } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateTeacherDto {
  @ApiProperty({ example: 'Priya' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  firstName!: string;

  @ApiProperty({ example: 'Nair' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  lastName!: string;

  @ApiProperty({ example: 'priya.nair@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({
    type: [String],
    required: false,
    description:
      'Subject ids the teacher is qualified to teach, school-wide (no section) — the same shape the CSV import produces.',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  subjectIds?: string[];
}
