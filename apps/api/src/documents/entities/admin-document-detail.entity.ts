import { ApiProperty } from '@nestjs/swagger';
import { AdminDocumentEntity } from './admin-document.entity';

export class AdminDocumentDetailEntity extends AdminDocumentEntity {
  @ApiProperty() updatedAt!: Date;
  @ApiProperty({ nullable: true, type: String }) sourceKey!: string | null;
}
