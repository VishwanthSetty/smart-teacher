import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateSectionDto {
  @ApiProperty({ description: 'GradeLevel this section belongs to' })
  @IsString()
  @IsNotEmpty()
  gradeLevelId!: string;

  @ApiProperty({ example: 'A' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  name!: string;
}
