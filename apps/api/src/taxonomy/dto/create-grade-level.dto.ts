import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsPositive, IsString, MinLength } from 'class-validator';

export class CreateGradeLevelDto {
  @ApiProperty({ example: 'Grade 5' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({ example: 5, description: 'Display order; unique across the platform.' })
  @IsInt()
  @IsPositive()
  rank!: number;
}
