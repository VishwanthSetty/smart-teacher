import { Injectable } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { SectionsService } from '../students/sections.service';
import { DashboardStatsEntity } from './entities/dashboard-stats.entity';

// Aggregator for the admin dashboard: it owns no data of its own and composes other
// features' services, so TimetablesService can slot in here later without
// this module having to move or grow a repository.
@Injectable()
export class StatsService {
  constructor(
    private readonly usersService: UsersService,
    private readonly sectionsService: SectionsService,
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
}
