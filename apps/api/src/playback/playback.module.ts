import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { StorageModule } from '../storage/storage.module';
import { VideosModule } from '../videos/videos.module';
import { PlaybackDeliveryController } from './playback-delivery.controller';
import { PlaybackController } from './playback.controller';
import { PlaybackService } from './playback.service';
import { PlaybackTokenService } from './playback-token.service';

@Module({
  imports: [JwtModule.register({}), VideosModule, StorageModule],
  controllers: [PlaybackController, PlaybackDeliveryController],
  providers: [PlaybackService, PlaybackTokenService],
  exports: [PlaybackTokenService],
})
export class PlaybackModule {}
