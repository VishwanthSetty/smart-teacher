import { ApiProperty } from '@nestjs/swagger';
import { ContentAudience, CurriculumStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListCurriculaQueryDto {
  @ApiProperty({ required: false, default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiProperty({ required: false, default: 50, minimum: 1, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit: number = 50;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  gradeLevelId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  subjectId?: string;

  @ApiProperty({ required: false, enum: CurriculumStatus })
  @IsOptional()
  @IsEnum(CurriculumStatus)
  status?: CurriculumStatus;

  @ApiProperty({ required: false, enum: ContentAudience })
  @IsOptional()
  @IsEnum(ContentAudience)
  audience?: ContentAudience;
}
