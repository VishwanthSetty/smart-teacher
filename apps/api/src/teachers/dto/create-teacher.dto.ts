import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';

export class CreateTeacherAssignmentInputDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  subjectId!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  gradeLevelId?: string;
}

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

  @ApiProperty({ required: false, description: 'Left blank, a password is generated and returned to the admin.' })
  @Transform(({ value }: { value: unknown }) => value === '' ? undefined : value)
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password?: string;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  sendCredentialsEmail?: boolean;

  @ApiProperty({
    type: [CreateTeacherAssignmentInputDto],
    required: false,
    description:
      'Subject ids the teacher is qualified to teach, school-wide (no section) — the same shape the CSV import produces.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateTeacherAssignmentInputDto)
  assignments?: CreateTeacherAssignmentInputDto[];
}
