import { ApiProperty } from '@nestjs/swagger';
import { AdminDocumentEntity } from './admin-document.entity';

class PaginationMeta {
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() total!: number;
  @ApiProperty() totalPages!: number;
}

export class PaginatedAdminDocumentsEntity {
  @ApiProperty({ type: [AdminDocumentEntity] }) data!: AdminDocumentEntity[];
  @ApiProperty({ type: PaginationMeta }) meta!: PaginationMeta;
}
