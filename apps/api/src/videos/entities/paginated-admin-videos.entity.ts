import { ApiProperty } from '@nestjs/swagger';
import { AdminVideoEntity } from './admin-video.entity';

class PaginationMeta {
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() total!: number;
  @ApiProperty() totalPages!: number;
}

export class PaginatedAdminVideosEntity {
  @ApiProperty({ type: [AdminVideoEntity] })
  data!: AdminVideoEntity[];
  @ApiProperty({ type: PaginationMeta })
  meta!: PaginationMeta;
}
