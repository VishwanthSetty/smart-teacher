import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CurriculumLevelDto {
  // 1-based and contiguous across the schema — the service rejects gaps, because a level
  // at depth 3 with nothing at depth 2 describes a tree no node could ever occupy.
  @ApiProperty({ minimum: 1, maximum: 10 })
  @IsInt()
  @Min(1)
  @Max(10)
  depth!: number;

  @ApiProperty({ example: 'Chapter' })
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name!: string;

  @ApiProperty({ default: false })
  @IsBoolean()
  canHoldContent!: boolean;
}

export class CreateCurriculumSchemaDto {
  @ApiProperty({ example: 'Chapter / Topic' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  // Immutable once created, same role as Subject.code: the stable handle an import can
  // key on.
  @ApiProperty({ example: 'chapter-topic' })
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9-]*$/, {
    message: 'code must be lowercase alphanumeric with hyphens',
  })
  @MaxLength(60)
  code!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  // Ten levels is far beyond any real curriculum and stops a payload that would make
  // every tree read pathological.
  @ApiProperty({ type: [CurriculumLevelDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => CurriculumLevelDto)
  levels!: CurriculumLevelDto[];
}
