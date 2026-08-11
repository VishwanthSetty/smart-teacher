import { ApiProperty } from '@nestjs/swagger';
import { AdminDocumentEntity } from './admin-document.entity';

export class DocumentUploadTicketEntity {
  @ApiProperty({ type: AdminDocumentEntity }) document!: AdminDocumentEntity;
  @ApiProperty() uploadUrl!: string;
  @ApiProperty() expiresInSecs!: number;
}
