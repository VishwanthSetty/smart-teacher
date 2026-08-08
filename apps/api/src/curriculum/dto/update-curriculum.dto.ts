import { ApiProperty } from '@nestjs/swagger';
import { CurriculumStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateCurriculumDto {
  // gradeLevelId and subjectId are absent by design: they are the curriculum's identity
  // and the key every entitlement is granted against. Re-pointing one would silently
  // move every school's licence to different content.
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  schemaId?: string;

  // Only ARCHIVED is settable here. DRAFT <-> PUBLISHED goes through the explicit
  // publish/unpublish routes, because those change what schools can see and deserve to
  // read as deliberate actions rather than a field on a PATCH body.
  @ApiProperty({ required: false, enum: [CurriculumStatus.ARCHIVED, CurriculumStatus.DRAFT] })
  @IsOptional()
  @IsEnum(CurriculumStatus)
  status?: CurriculumStatus;
}
