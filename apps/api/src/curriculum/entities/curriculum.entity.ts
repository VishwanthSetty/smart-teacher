import { ApiProperty } from '@nestjs/swagger';
import { CurriculumStatus } from '@prisma/client';
import { CurriculumLevelEntity } from './curriculum-schema.entity';

export class CurriculumEntity {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  gradeLevelId!: string;

  @ApiProperty()
  gradeLevelName!: string;

  @ApiProperty()
  subjectId!: string;

  @ApiProperty()
  subjectName!: string;

  @ApiProperty()
  schemaId!: string;

  @ApiProperty()
  schemaName!: string;

  @ApiProperty({ enum: CurriculumStatus })
  status!: CurriculumStatus;

  @ApiProperty({ nullable: true, type: Date })
  publishedAt!: Date | null;

  @ApiProperty()
  nodeCount!: number;

  @ApiProperty()
  videoCount!: number;
}

/** The tree builder's view: everything in CurriculumEntity plus the level vocabulary. */
export class CurriculumDetailEntity extends CurriculumEntity {
  @ApiProperty({ type: [CurriculumLevelEntity] })
  levels!: CurriculumLevelEntity[];

  // How many schools hold a grant. Publishing and unpublishing both act on live access,
  // so an operator should see the blast radius before doing either.
  @ApiProperty()
  entitledSchoolCount!: number;
}
