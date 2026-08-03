import { ApiProperty } from '@nestjs/swagger';

export class PlaybackTokenEntity {
  @ApiProperty() videoId!: string;
  @ApiProperty() manifestUrl!: string;
  @ApiProperty({ nullable: true, type: String }) posterUrl!: string | null;
  @ApiProperty({ nullable: true, type: Number }) durationSecs!: number | null;
  @ApiProperty() expiresInSecs!: number;
}
