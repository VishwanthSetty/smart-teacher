import { ApiProperty } from '@nestjs/swagger';
import { UserStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListStudentsQueryDto {
  @ApiProperty({ required: false, default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiProperty({ required: false, default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @ApiProperty({ required: false, description: 'Matches against name, email, or roll number' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({ required: false, description: 'Filter to students actively enrolled in this section' })
  @IsOptional()
  @IsString()
  sectionId?: string;

  @ApiProperty({ enum: UserStatus, required: false })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}
