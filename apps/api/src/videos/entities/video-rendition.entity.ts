import { ApiProperty } from '@nestjs/swagger';

export class VideoRenditionEntity {
  @ApiProperty()
  id!: string;
  @ApiProperty()
  name!: string;
  @ApiProperty()
  width!: number;
  @ApiProperty()
  height!: number;
  @ApiProperty()
  bitrateKbps!: number;
  @ApiProperty()
  playlistKey!: string;
}
