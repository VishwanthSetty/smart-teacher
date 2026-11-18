import { ApiProperty } from '@nestjs/swagger';
import { ContentAudience, ProgressStatus, ResourceType } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class LibrarySearchQueryDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() q?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() gradeLevelId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() subjectId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() contentNodeId?: string;
  @ApiProperty({ required: false, enum: ResourceType })
  @IsOptional() @IsEnum(ResourceType) type?: ResourceType;
  @ApiProperty({ required: false, enum: ContentAudience })
  @IsOptional() @IsEnum(ContentAudience) audience?: ContentAudience;
  @ApiProperty({ required: false, enum: ProgressStatus })
  @IsOptional() @IsEnum(ProgressStatus) progress?: ProgressStatus;
  @ApiProperty({ required: false }) @IsOptional() @IsString() cursor?: string;
}
