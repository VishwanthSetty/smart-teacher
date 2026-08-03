import { ApiProperty } from '@nestjs/swagger';
import { VideoStatus } from '@prisma/client';

/**
 * The library-management view. Carries the ingest lifecycle fields that VideoEntity
 * deliberately withholds from teachers and students — they only ever see READY content
 * and have no business knowing an upload failed.
 *
 * sourceKey stays out: it is an internal bucket path, and exposing it would invite a
 * client to construct its own object references.
 */
export class AdminVideoEntity {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ nullable: true, type: String })
  description!: string | null;

  @ApiProperty({ enum: VideoStatus })
  status!: VideoStatus;

  @ApiProperty({ nullable: true, type: Number })
  durationSecs!: number | null;

  @ApiProperty({ nullable: true, type: Number })
  sizeBytes!: number | null;

  @ApiProperty({ nullable: true, type: String })
  contentType!: string | null;

  @ApiProperty()
  gradeLevelId!: string;

  @ApiProperty()
  subjectId!: string;

  // Why the last transcode attempt failed, in words an admin can act on — a corrupt
  // source reads differently from a worker that never reported back. Null unless FAILED.
  @ApiProperty({ nullable: true, type: String })
  failureReason!: string | null;

  @ApiProperty()
  createdAt!: Date;
}
