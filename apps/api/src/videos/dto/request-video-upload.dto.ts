import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, Max, Min } from 'class-validator';
import {
  ACCEPTED_VIDEO_CONTENT_TYPES,
  MAX_VIDEO_BYTES,
  type AcceptedVideoContentType,
} from '../video-ingest.constants';

/**
 * Retrying an abandoned upload. The metadata is untouched — only the file changes, so
 * the caller re-declares what it is about to send and gets a fresh URL for the same key.
 */
export class RequestVideoUploadDto {
  @ApiProperty({ enum: ACCEPTED_VIDEO_CONTENT_TYPES, example: 'video/mp4' })
  @IsIn(ACCEPTED_VIDEO_CONTENT_TYPES)
  contentType!: AcceptedVideoContentType;

  @ApiProperty({ example: 104857600, maximum: MAX_VIDEO_BYTES })
  @IsInt()
  @Min(1)
  @Max(MAX_VIDEO_BYTES)
  sizeBytes!: number;
}
