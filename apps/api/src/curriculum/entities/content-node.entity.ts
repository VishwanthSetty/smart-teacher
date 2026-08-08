import { ApiProperty } from '@nestjs/swagger';

export class ContentNodeEntity {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  curriculumId!: string;

  @ApiProperty({ nullable: true, type: String })
  parentId!: string | null;

  @ApiProperty()
  depth!: number;

  // The level name from the curriculum's schema at this depth — "Chapter", "Topic".
  // Resolved server-side so a client never has to join the schema itself to render a
  // label or an "Add <level>" button.
  @ApiProperty({ example: 'Chapter' })
  levelName!: string;

  @ApiProperty()
  canHoldContent!: boolean;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ nullable: true, type: String })
  description!: string | null;

  @ApiProperty()
  sortOrder!: number;
}
