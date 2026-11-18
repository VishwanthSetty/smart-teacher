import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { BulkContentKind, MAX_BULK_CONTENT_ITEMS } from '../content-bulk.constants';

export class ConfirmBulkContentItemDto {
  @ApiProperty({ enum: BulkContentKind })
  @IsEnum(BulkContentKind)
  kind!: BulkContentKind;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  id!: string;
}

export class ConfirmBulkContentDto {
  @ApiProperty({ type: [ConfirmBulkContentItemDto], maxItems: MAX_BULK_CONTENT_ITEMS })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_BULK_CONTENT_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => ConfirmBulkContentItemDto)
  items!: ConfirmBulkContentItemDto[];
}
