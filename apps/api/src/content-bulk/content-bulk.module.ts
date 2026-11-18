import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module';
import { VideosModule } from '../videos/videos.module';
import { ContentBulkController } from './content-bulk.controller';
import { ContentBulkService } from './content-bulk.service';

@Module({
  imports: [VideosModule, DocumentsModule],
  controllers: [ContentBulkController],
  providers: [ContentBulkService],
})
export class ContentBulkModule {}
