import { ApiProperty } from '@nestjs/swagger';
import { ContentAudience } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

export class ListMyCurriculaQueryDto {
  @ApiProperty({ required: false, enum: ContentAudience })
  @IsOptional()
  @IsEnum(ContentAudience)
  audience?: ContentAudience;
}
