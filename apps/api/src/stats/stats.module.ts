import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { StudentsModule } from '../students/students.module';
import { StatsController } from './stats.controller';
import { PlatformStatsController } from './platform-stats.controller';
import { StatsService } from './stats.service';
import { SchoolsModule } from '../schools/schools.module';
import { CurriculumModule } from '../curriculum/curriculum.module';
import { VideosModule } from '../videos/videos.module';
import { DocumentsModule } from '../documents/documents.module';

@Module({
  imports: [UsersModule, StudentsModule, SchoolsModule, CurriculumModule, VideosModule, DocumentsModule],
  controllers: [StatsController, PlatformStatsController],
  providers: [StatsService],
})
export class StatsModule {}
