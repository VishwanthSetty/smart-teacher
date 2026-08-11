import { ApiProperty } from '@nestjs/swagger';
import { ContentAudience } from '@prisma/client';
import { ArrayMaxSize, IsArray, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class ReplaceEntitlementsDto {
  // The desired complete set of curricula for the school. An empty array is valid — it
  // revokes every active-subject entitlement, which is how an operator clears a school.
  // Bounded well above any realistic grade x subject product to stop a hostile payload.
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(2000)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  curriculumIds!: string[];

  @ApiProperty({ required: false, enum: ContentAudience })
  @IsOptional()
  @IsEnum(ContentAudience)
  audience?: ContentAudience;
}
