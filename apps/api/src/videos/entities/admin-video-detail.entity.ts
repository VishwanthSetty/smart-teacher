import { ApiProperty } from '@nestjs/swagger';
import { AdminVideoEntity } from './admin-video.entity';
import { VideoRenditionEntity } from './video-rendition.entity';

/**
 * SUPER_ADMIN-only diagnostics. Keys are exposed so an operator can reconcile storage;
 * they grant no access by themselves because objects are served only through signed URLs.
 */
export class AdminVideoDetailEntity extends AdminVideoEntity {
  @ApiProperty()
  updatedAt!: Date;
  @ApiProperty()
  transcodeAttempts!: number;
  @ApiProperty({ nullable: true, type: Date })
  transcodeStartedAt!: Date | null;
  @ApiProperty({ nullable: true, type: Boolean })
  retainSource!: boolean | null;
  @ApiProperty({ nullable: true, type: String })
  sourceKey!: string | null;
  @ApiProperty({ nullable: true, type: String })
  playlistKey!: string | null;
  @ApiProperty({ nullable: true, type: String })
  posterKey!: string | null;
  @ApiProperty({ type: [VideoRenditionEntity] })
  renditions!: VideoRenditionEntity[];
}
