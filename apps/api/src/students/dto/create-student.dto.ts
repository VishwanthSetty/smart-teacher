import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

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

  @ApiProperty({ example: '12', required: false, description: 'Unique within the chosen section' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  rollNumber?: string;

  @ApiProperty({ required: false, description: 'Optional section to enroll the student into' })
  @Transform(({ value }: { value: unknown }) => value === '' ? undefined : value)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  sectionId?: string;
}
