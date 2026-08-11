import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { ACCEPTED_DOCUMENT_CONTENT_TYPES, MAX_DOCUMENT_BYTES, type AcceptedDocumentContentType } from '../document-ingest.constants';

export class CreateDocumentDto {
  @ApiProperty()
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

  @ApiProperty({ enum: ACCEPTED_DOCUMENT_CONTENT_TYPES })
  @IsIn(ACCEPTED_DOCUMENT_CONTENT_TYPES)
  contentType!: AcceptedDocumentContentType;

  @ApiProperty({ maximum: MAX_DOCUMENT_BYTES })
  @IsInt()
  @Min(1)
  @Max(MAX_DOCUMENT_BYTES)
  sizeBytes!: number;
}
