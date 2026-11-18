import { ApiProperty } from '@nestjs/swagger';
import { ProgressStatus, ResourceType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ActivityQueryDto {
  @ApiProperty({ required: false, enum: ResourceType })
  @IsOptional()
  @IsEnum(ResourceType)
  type?: ResourceType;

  @ApiProperty({ required: false, enum: ProgressStatus })
  @IsOptional()
  @IsEnum(ProgressStatus)
  status?: ProgressStatus;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiProperty({ required: false, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}
