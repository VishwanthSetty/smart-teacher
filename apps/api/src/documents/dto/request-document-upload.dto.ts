import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, Max, Min } from 'class-validator';
import { ACCEPTED_DOCUMENT_CONTENT_TYPES, MAX_DOCUMENT_BYTES, type AcceptedDocumentContentType } from '../document-ingest.constants';

export class RequestDocumentUploadDto {
  @ApiProperty({ enum: ACCEPTED_DOCUMENT_CONTENT_TYPES })
  @IsIn(ACCEPTED_DOCUMENT_CONTENT_TYPES)
  contentType!: AcceptedDocumentContentType;

  @ApiProperty({ maximum: MAX_DOCUMENT_BYTES })
  @IsInt()
  @Min(1)
  @Max(MAX_DOCUMENT_BYTES)
  sizeBytes!: number;
}
