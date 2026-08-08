import { ApiProperty } from '@nestjs/swagger';

export class VideoEntity {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ nullable: true, type: String })
  description!: string | null;

  @ApiProperty({ nullable: true, type: Number })
  durationSecs!: number | null;

  @ApiProperty()
  contentNodeId!: string;

  @ApiProperty()
  contentNodeTitle!: string;

  @ApiProperty()
  curriculumId!: string;

  // Denormalized off the node's curriculum so a flat video list can still label itself
  // without a second round trip. The entitlement decision keys on curriculumId alone.
  @ApiProperty()
  gradeLevelId!: string;

  @ApiProperty()
  subjectId!: string;
}
