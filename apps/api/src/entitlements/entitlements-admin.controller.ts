import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { BypassTenantScope } from '../tenancy/decorators/bypass-tenant-scope.decorator';
import { ContentEntitlementsAdminService } from './content-entitlements-admin.service';
import { GrantEntitlementDto } from './dto/grant-entitlement.dto';
import { ReplaceEntitlementsDto } from './dto/replace-entitlements.dto';
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
  @ApiResponse({ status: 404, description: 'School or curriculum not found.' })
  @ApiResponse({
    status: 409,
    description:
      'The school already holds this entitlement, or the subject is retired, or the curriculum is archived.',
  })
  grant(
    @Param('schoolId') schoolId: string,
    @Body() dto: GrantEntitlementDto,
  ): Promise<EntitlementEntity> {
    return this.entitlementsAdmin.grant(schoolId, dto);
  }

  // Batch save for the checkbox-matrix admin UI: replaces the school's entire entitlement
  // set in one call instead of one grant/revoke round-trip per curriculum.
  @Put()
  @ApiResponse({ status: 200, type: [EntitlementEntity] })
  @ApiResponse({ status: 404, description: 'School or curriculum not found.' })
  @ApiResponse({
    status: 409,
    description: 'A named curriculum is archived, or its subject is retired, and it is not already granted.',
  })
  replaceAll(
    @Param('schoolId') schoolId: string,
    @Body() dto: ReplaceEntitlementsDto,
  ): Promise<EntitlementEntity[]> {
    return this.entitlementsAdmin.replaceForSchool(schoolId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiResponse({ status: 204, description: 'The entitlement is revoked; the school loses access immediately.' })
  @ApiResponse({ status: 404, description: 'Entitlement not found for this school.' })
  revoke(@Param('schoolId') schoolId: string, @Param('id') id: string): Promise<void> {
    return this.entitlementsAdmin.revoke(schoolId, id);
  }
}
