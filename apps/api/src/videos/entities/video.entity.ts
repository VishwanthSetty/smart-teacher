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
  gradeLevelId!: string;

  @ApiProperty()
  subjectId!: string;
}
