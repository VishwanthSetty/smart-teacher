import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { BulkContentKind, MAX_BULK_CONTENT_ITEMS } from '../content-bulk.constants';

export class BulkContentItemDto {
  @ApiProperty({ enum: BulkContentKind })
  @IsEnum(BulkContentKind)
  kind!: BulkContentKind;

  @ApiProperty({ example: 'Fractions — Lesson 1' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  contentNodeId!: string;

  // The accepted type and size limit depend on `kind`, so ContentBulkService checks them.
  // A decorator here would reject the whole batch over one unsuitable file.
  @ApiProperty({ example: 'video/mp4' })
  @IsString()
  @MinLength(1)
  contentType!: string;

  @ApiProperty({ example: 104857600 })
  @IsInt()
  @Min(1)
  sizeBytes!: number;
}

export class CreateBulkContentDto {
  @ApiProperty({ type: [BulkContentItemDto], maxItems: MAX_BULK_CONTENT_ITEMS })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_BULK_CONTENT_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => BulkContentItemDto)
  items!: BulkContentItemDto[];
}
