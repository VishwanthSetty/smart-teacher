import { ApiProperty } from '@nestjs/swagger';
import { VideoStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListAdminVideosQueryDto {
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

  @ApiProperty({ enum: VideoStatus, required: false })
  @IsOptional()
  @IsEnum(VideoStatus)
  status?: VideoStatus;

  // Grade level and subject remain useful filters even though a video no longer carries
  // them — they resolve through the node's curriculum.
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  gradeLevelId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  subjectId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  curriculumId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  contentNodeId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  search?: string;
}
