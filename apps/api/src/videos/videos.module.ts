import { Module } from '@nestjs/common';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { StorageModule } from '../storage/storage.module';
import { TranscodingModule } from '../transcoding/transcoding.module';
import { CurriculumModule } from '../curriculum/curriculum.module';
import { VideosAccessPolicy } from './videos-access.policy';
import { VideosService } from './videos.service';
import { VideosController } from './videos.controller';
import { VideosAdminController } from './videos-admin.controller';
import { TranscodeCallbackController } from './transcode-callback.controller';
import { TranscodeCallbackService } from './transcode-callback.service';
import { TranscodeReconcilerService } from './transcode-reconciler.service';

@Module({
  imports: [EntitlementsModule, StorageModule, TranscodingModule, CurriculumModule],
  controllers: [VideosController, VideosAdminController, TranscodeCallbackController],
  providers: [
    VideosService,
    VideosAccessPolicy,
    TranscodeCallbackService,
    TranscodeReconcilerService,
  ],
  // The policy stays internal: other modules go through VideosService, which already
  // applies it, rather than re-deciding access for themselves.
  exports: [VideosService],
})
export class VideosModule {}
