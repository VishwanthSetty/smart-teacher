import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { BypassTenantScope } from '../tenancy/decorators/bypass-tenant-scope.decorator';
import { ContentEntitlementsAdminService } from './content-entitlements-admin.service';
import { EntitlementOverviewEntity } from './entities/entitlement-overview.entity';

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/entitlements')
@Roles(Role.SUPER_ADMIN)
@BypassTenantScope()
export class EntitlementsOverviewAdminController {
  constructor(private readonly entitlementsAdmin: ContentEntitlementsAdminService) {}

  @Get('overview')
  @ApiResponse({ status: 200, type: EntitlementOverviewEntity })
  getOverview(): Promise<EntitlementOverviewEntity> {
    return this.entitlementsAdmin.getOverview();
  }
}
