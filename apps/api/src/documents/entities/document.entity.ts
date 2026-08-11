import { ApiProperty } from '@nestjs/swagger';

export class DocumentEntity {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ nullable: true, type: String }) description!: string | null;
  @ApiProperty() contentNodeId!: string;
  @ApiProperty() contentNodeTitle!: string;
  @ApiProperty() curriculumId!: string;
  @ApiProperty() gradeLevelId!: string;
  @ApiProperty() subjectId!: string;
}
