import { ApiProperty } from '@nestjs/swagger';
import { SchoolStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateSchoolDto {
  @ApiProperty({ example: 'Springfield High', required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiProperty({ enum: SchoolStatus, required: false })
  @IsOptional()
  @IsEnum(SchoolStatus)
  status?: SchoolStatus;
}
