import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { CurriculumLevelDto } from './create-curriculum-schema.dto';

export class UpdateCurriculumSchemaDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  // `code` is absent by design — it is the stable handle imports key on, so nothing may
  // PATCH it, the same rule Subject.code follows.
  //
  // Supplying levels replaces the whole set. The service refuses to drop a depth that
  // any curriculum still has nodes at, so an edit cannot strand a subtree below the
  // vocabulary that names it.
  @ApiProperty({ required: false, type: [CurriculumLevelDto] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => CurriculumLevelDto)
  levels?: CurriculumLevelDto[];
}
