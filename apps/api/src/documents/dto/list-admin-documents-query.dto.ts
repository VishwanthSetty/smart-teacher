import { ApiProperty } from '@nestjs/swagger';
import { DocumentStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListAdminDocumentsQueryDto {
  @ApiProperty({ required: false, default: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page: number = 1;

  @ApiProperty({ required: false, default: 20 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit: number = 20;

  @ApiProperty({ required: false, enum: DocumentStatus })
  @IsOptional() @IsEnum(DocumentStatus)
  status?: DocumentStatus;

  @ApiProperty({ required: false }) @IsOptional() @IsString() gradeLevelId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() subjectId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() curriculumId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() contentNodeId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() search?: string;
}
