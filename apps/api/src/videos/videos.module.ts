import { Module } from '@nestjs/common';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { VideosAccessPolicy } from './videos-access.policy';
import { VideosService } from './videos.service';
import { VideosController } from './videos.controller';
import { VideosAdminController } from './videos-admin.controller';

@Module({
  imports: [EntitlementsModule],
  controllers: [VideosController, VideosAdminController],
  providers: [VideosService, VideosAccessPolicy],
  // The policy stays internal: other modules go through VideosService, which already
  // applies it, rather than re-deciding access for themselves.
  exports: [VideosService],
})
export class VideosModule {}
