import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { BypassTenantScope } from '../tenancy/decorators/bypass-tenant-scope.decorator';
import { ContentEntitlementsAdminService } from './content-entitlements-admin.service';
import { GrantEntitlementDto } from './dto/grant-entitlement.dto';
import { EntitlementEntity } from './entities/entitlement.entity';

// Which platform content each school may see — SUPER_ADMIN only (F-06: "Grant school
// content entitlements"). SCHOOL_ADMIN gets a 403 here, per the acceptance criteria.
//
// @BypassTenantScope() is required, not optional: SchoolContentEntitlement is in
// TENANT_SCOPED_MODELS and SUPER_ADMIN has a null schoolId, so without it every query
// below throws MissingTenantContextError (-> 500). The bypass only engages for
// SUPER_ADMIN (TenantContextInterceptor checks the role too), and the schoolId comes
// from the route path, so each request still names exactly one tenant.
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/schools/:schoolId/entitlements')
@Roles(Role.SUPER_ADMIN)
@BypassTenantScope()
export class EntitlementsAdminController {
  constructor(private readonly entitlementsAdmin: ContentEntitlementsAdminService) {}

  @Get()
  @ApiResponse({ status: 200, type: [EntitlementEntity] })
  @ApiResponse({ status: 404, description: 'School not found.' })
  findAll(@Param('schoolId') schoolId: string): Promise<EntitlementEntity[]> {
    return this.entitlementsAdmin.listForSchool(schoolId);
  }

  @Post()
  @ApiResponse({ status: 201, type: EntitlementEntity })
  @ApiResponse({ status: 404, description: 'School, grade level, or subject not found.' })
  @ApiResponse({
    status: 409,
    description: 'The school already holds this entitlement, or the subject is retired.',
  })
  grant(
    @Param('schoolId') schoolId: string,
    @Body() dto: GrantEntitlementDto,
  ): Promise<EntitlementEntity> {
    return this.entitlementsAdmin.grant(schoolId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiResponse({ status: 204, description: 'The entitlement is revoked; the school loses access immediately.' })
  @ApiResponse({ status: 404, description: 'Entitlement not found for this school.' })
  revoke(@Param('schoolId') schoolId: string, @Param('id') id: string): Promise<void> {
    return this.entitlementsAdmin.revoke(schoolId, id);
  }
}
