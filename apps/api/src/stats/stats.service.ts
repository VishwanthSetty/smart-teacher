import { Injectable } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { DashboardStatsEntity } from './entities/dashboard-stats.entity';

// Aggregator for the admin dashboard: it owns no data of its own and composes other
// features' services, so ClassesService/TimetablesService slot in here later without
// this module having to move or grow a repository.
@Injectable()
export class StatsService {
  constructor(private readonly usersService: UsersService) {}

  async getSummary(): Promise<DashboardStatsEntity> {
    const counts = await this.usersService.countMembership();

    return {
      ...counts,
      // Explicitly null rather than 0: the Class and Timetable models don't exist yet
      // (F-08/F-09), and a zero here would read as "this school has no classes".
      classes: null,
      latestTimetable: null,
    };
  }
}
