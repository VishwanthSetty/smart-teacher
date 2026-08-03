import { ApiProperty } from '@nestjs/swagger';
import { AdminVideoEntity } from './admin-video.entity';

/**
 * A created (or retried) video plus the one-shot capability to upload its source.
 *
 * The URL is short-lived and scoped to a single object key, so it is safe to hand to
 * the browser but must never be persisted — see the "never store a signed URL" note on
 * Video.externalId.
 */
export class VideoUploadTicketEntity {
  @ApiProperty({ type: AdminVideoEntity })
  video!: AdminVideoEntity;

  @ApiProperty({ description: 'Presigned PUT URL, valid for expiresInSecs.' })
  uploadUrl!: string;

  @ApiProperty({ example: 900 })
  expiresInSecs!: number;
}
