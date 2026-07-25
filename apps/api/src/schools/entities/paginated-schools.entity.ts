import { ApiProperty } from '@nestjs/swagger';
import { SchoolEntity } from './school.entity';

export class PaginationMeta {
  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  total!: number;

  @ApiProperty()
  totalPages!: number;
}

export class PaginatedSchoolsEntity {
  @ApiProperty({ type: [SchoolEntity] })
  data!: SchoolEntity[];

  @ApiProperty({ type: PaginationMeta })
  meta!: PaginationMeta;
}
