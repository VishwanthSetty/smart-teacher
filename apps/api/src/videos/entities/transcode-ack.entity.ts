import { ApiProperty } from '@nestjs/swagger';
import { VideoStatus } from '@prisma/client';

// What the worker gets back from a callback. Deliberately just the resulting state: the
// worker has no business knowing anything else about the row, and returning the Prisma
// model would leak sourceKey and every future column.
export class TranscodeAckEntity {
  @ApiProperty()
  videoId!: string;

  @ApiProperty({ enum: VideoStatus })
  status!: VideoStatus;
}
