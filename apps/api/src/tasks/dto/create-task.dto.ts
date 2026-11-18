import { ApiProperty } from '@nestjs/swagger';
import { ResourceType } from '@prisma/client';
import {
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateTaskDto {
  @ApiProperty()
  @IsString()
  @MaxLength(160)
  title!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  instructions?: string;

  @ApiProperty({ required: false, format: 'date-time' })
  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @ApiProperty({ enum: ResourceType })
  @IsEnum(ResourceType)
  resourceType!: ResourceType;

  @ApiProperty()
  @IsString()
  resourceId!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  sectionId?: string;

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayUnique()
  studentIds?: string[];
}
