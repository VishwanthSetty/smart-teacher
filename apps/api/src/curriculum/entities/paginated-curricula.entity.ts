import { ApiProperty } from '@nestjs/swagger';
import { CurriculumEntity } from './curriculum.entity';

class PaginationMeta {
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() total!: number;
  @ApiProperty() totalPages!: number;
}

export class PaginatedCurriculaEntity {
  @ApiProperty({ type: [CurriculumEntity] })
  data!: CurriculumEntity[];
  @ApiProperty({ type: PaginationMeta })
  meta!: PaginationMeta;
}
