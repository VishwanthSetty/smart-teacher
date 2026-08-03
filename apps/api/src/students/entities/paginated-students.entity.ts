import { ApiProperty } from '@nestjs/swagger';
import { StudentEntity } from './student.entity';

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

export class PaginatedStudentsEntity {
  @ApiProperty({ type: [StudentEntity] })
  data!: StudentEntity[];

  @ApiProperty({ type: PaginationMeta })
  meta!: PaginationMeta;
}
