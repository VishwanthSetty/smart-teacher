import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsPositive, IsString, Max, Min, MinLength } from 'class-validator';
import {
  ACCEPTED_VIDEO_CONTENT_TYPES,
  MAX_VIDEO_BYTES,
  type AcceptedVideoContentType,
} from '../video-ingest.constants';

export class CreateVideoDto {
  @ApiProperty({ example: 'Grade 5 Maths — Fractions' })
  @IsString()
  @MinLength(1)
  title!: string;

  @ApiProperty({ required: false, example: 'An introduction to numerators and denominators.' })
  @IsOptional()
  @IsString()
  description?: string;

  // No externalId: it is the playback handle the transcoder produces, and the source
  // object key is derived server-side from the generated row id. Neither is the
  // caller's to choose, so both are absent here and forbidNonWhitelisted rejects them.
  @ApiProperty({ required: false, example: 480 })
  @IsOptional()
  @IsInt()
  @IsPositive()
  durationSecs?: number;

  // Where this video sits in the curriculum tree. The grade level and subject are
  // implied by the node's curriculum, so neither is accepted here — passing them would
  // be a second, contradictable source of truth for the entitlement key.
  @ApiProperty()
  @IsString()
  @MinLength(1)
  contentNodeId!: string;

  // Declared up front so an unacceptable file is refused *before* an upload URL exists,
  // and so the type can be bound into the signature. Re-verified against the stored
  // object at confirm time — this value is a request, not evidence.
  @ApiProperty({ enum: ACCEPTED_VIDEO_CONTENT_TYPES, example: 'video/mp4' })
  @IsIn(ACCEPTED_VIDEO_CONTENT_TYPES)
  contentType!: AcceptedVideoContentType;

  @ApiProperty({ example: 104857600, maximum: MAX_VIDEO_BYTES })
  @IsInt()
  @Min(1)
  @Max(MAX_VIDEO_BYTES)
  sizeBytes!: number;
}
