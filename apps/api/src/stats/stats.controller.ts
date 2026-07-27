import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { DashboardStatsEntity } from './entities/dashboard-stats.entity';
import { StatsService } from './stats.service';

// No @BypassTenantScope(): SCHOOL_ADMIN always carries a schoolId, and SUPER_ADMIN —
// who would trip the tenant guard with its null schoolId — is rejected by RolesGuard
// before the handler is ever reached.
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/stats')
@Roles(Role.SCHOOL_ADMIN)
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  @Get()
  @ApiResponse({ status: 200, type: DashboardStatsEntity })
  getSummary(): Promise<DashboardStatsEntity> {
    return this.statsService.getSummary();
  }
}
