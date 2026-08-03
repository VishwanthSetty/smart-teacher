import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsPositive, IsString, MinLength } from 'class-validator';

export class UpdateGradeLevelDto {
  @ApiProperty({ example: 'Grade 5', required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiProperty({ example: 5, description: 'Display order; unique across the platform.', required: false })
  @IsOptional()
  @IsInt()
  @IsPositive()
  rank?: number;
}
