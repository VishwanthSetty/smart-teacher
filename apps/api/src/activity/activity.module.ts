import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { TasksModule } from '../tasks/tasks.module';
import { TeachersModule } from '../teachers/teachers.module';
import { VideosModule } from '../videos/videos.module';
import { ActivityAccessPolicy } from './activity-access.policy';
import { BookmarksController } from './bookmarks.controller';
import { BookmarksService } from './bookmarks.service';
import { CollectionsService } from './collections.service';
import { HistoryController } from './history.controller';
import { HistoryService } from './history.service';
import { HomeController } from './home.controller';
import { HomeService } from './home.service';
import { LibrarySearchController } from './library-search.controller';
import { LibrarySearchService } from './library-search.service';
import { ProgressController } from './progress.controller';
import { ProgressService } from './progress.service';

@Module({
  imports: [VideosModule, DocumentsModule, EntitlementsModule, TasksModule, TeachersModule],
  controllers: [
    ProgressController,
    HistoryController,
    BookmarksController,
    LibrarySearchController,
    HomeController,
  ],
  providers: [
    ProgressService,
    HistoryService,
    BookmarksService,
    CollectionsService,
    LibrarySearchService,
    HomeService,
    ActivityAccessPolicy,
  ],
  exports: [ProgressService],
})
export class ActivityModule {}
