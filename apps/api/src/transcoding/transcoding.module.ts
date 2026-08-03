import { Module } from '@nestjs/common';
import { TranscodeQueue } from './transcode-queue';
import { RedisTranscodeQueue } from './redis-transcode-queue';

@Module({
  providers: [{ provide: TranscodeQueue, useClass: RedisTranscodeQueue }],
  exports: [TranscodeQueue],
})
export class TranscodingModule {}
