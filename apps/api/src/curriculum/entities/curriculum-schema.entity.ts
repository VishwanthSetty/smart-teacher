import { ApiProperty } from '@nestjs/swagger';

export class CurriculumLevelEntity {
  @ApiProperty()
  id!: string;

  // 1-based, counted below the grade/subject spine: depth 1 is the first authored level.
  @ApiProperty()
  depth!: number;

  @ApiProperty({ example: 'Chapter' })
  name!: string;

  @ApiProperty()
  canHoldContent!: boolean;
}

export class CurriculumSchemaEntity {
  @ApiProperty()
  id!: string;

  @ApiProperty({ example: 'Chapter / Topic' })
  name!: string;

  @ApiProperty({ example: 'chapter-topic' })
  code!: string;

  @ApiProperty({ nullable: true, type: String })
  description!: string | null;

  @ApiProperty({ type: [CurriculumLevelEntity] })
  levels!: CurriculumLevelEntity[];

  // How many curricula bind this schema. An operator needs to know a schema is in use
  // before editing its levels.
  @ApiProperty()
  curriculumCount!: number;
}
