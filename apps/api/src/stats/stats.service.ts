import { Injectable } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { SectionsService } from '../students/sections.service';
import { DashboardStatsEntity } from './entities/dashboard-stats.entity';
import { PlatformDashboardStatsEntity } from './entities/platform-dashboard-stats.entity';
import { SchoolsService } from '../schools/schools.service';
import { CurriculaService } from '../curriculum/curricula.service';
import { VideosService } from '../videos/videos.service';
import { DocumentsService } from '../documents/documents.service';

// Aggregator for the admin dashboard: it owns no data of its own and composes other
// features' services, so TimetablesService can slot in here later without
// this module having to move or grow a repository.
@Injectable()
export class StatsService {
  constructor(
    private readonly usersService: UsersService,
    private readonly sectionsService: SectionsService,
    private readonly schoolsService: SchoolsService,
    private readonly curriculaService: CurriculaService,
    private readonly videosService: VideosService,
    private readonly documentsService: DocumentsService,
  ) {}

  async getSummary(): Promise<DashboardStatsEntity> {
    const [counts, classes] = await Promise.all([
      this.usersService.countMembership(),
      this.sectionsService.countAll(),
    ]);

    return {
      ...counts,
      classes,
      latestTimetable: null,
    };
  }

  async getPlatformSummary(): Promise<PlatformDashboardStatsEntity> {
    const [schools, curricula, pipeline, documents] = await Promise.all([
      this.schoolsService.getPlatformOverview(),
      this.curriculaService.countAll(),
      this.videosService.getPlatformPipeline(),
      this.documentsService.countAll(),
    ]);

    return {
      schools: schools.total,
      curricula,
      videos: pipeline.total,
      documents,
      recentSchools: schools.recent,
      contentPipeline: {
        ready: pipeline.ready,
        processing: pipeline.processing,
        queued: pipeline.queued,
        failed: pipeline.failed,
      },
    };
  }
}
