import { ApiProperty } from '@nestjs/swagger';

export class ContentImpactEntity {
  @ApiProperty() curriculumId!: string;
  @ApiProperty() gradeLevelId!: string;
  @ApiProperty() subjectId!: string;
  @ApiProperty() schoolCount!: number;
  @ApiProperty() studentCount!: number;
  @ApiProperty() videoCount!: number;
}
