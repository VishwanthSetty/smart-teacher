import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { BypassTenantScope } from '../tenancy/decorators/bypass-tenant-scope.decorator';
import { PlatformDashboardStatsEntity } from './entities/platform-dashboard-stats.entity';
import { StatsService } from './stats.service';

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/platform-stats')
@Roles(Role.SUPER_ADMIN)
@BypassTenantScope()
export class PlatformStatsController {
  constructor(private readonly statsService: StatsService) {}

  @Get()
  @ApiResponse({ status: 200, type: PlatformDashboardStatsEntity })
  getSummary(): Promise<PlatformDashboardStatsEntity> {
    return this.statsService.getPlatformSummary();
  }
}
