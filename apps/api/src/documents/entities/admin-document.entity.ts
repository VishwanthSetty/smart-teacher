import { ApiProperty } from '@nestjs/swagger';
import { DocumentStatus } from '@prisma/client';
import { DocumentEntity } from './document.entity';

export class AdminDocumentEntity extends DocumentEntity {
  @ApiProperty({ enum: DocumentStatus }) status!: DocumentStatus;
  @ApiProperty({ nullable: true, type: Number }) sizeBytes!: number | null;
  @ApiProperty({ nullable: true, type: String }) contentType!: string | null;
  @ApiProperty({ nullable: true, type: String }) failureReason!: string | null;
  @ApiProperty() createdAt!: Date;
}
