import { ApiProperty } from '@nestjs/swagger';
import { ContentAudience } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateCurriculumDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  gradeLevelId!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  subjectId!: string;

  // The level vocabulary this curriculum's tree follows. Swappable later via PATCH, but
  // only while the existing nodes still fit the new schema's depth.
  @ApiProperty()
  @IsString()
  @MinLength(1)
  schemaId!: string;

  @ApiProperty({ required: false, enum: ContentAudience, default: ContentAudience.STUDENT })
  @IsOptional()
  @IsEnum(ContentAudience)
  audience?: ContentAudience;
}
