import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { BypassTenantScope } from '../tenancy/decorators/bypass-tenant-scope.decorator';
import { TaxonomyService } from './taxonomy.service';
import { CreateGradeLevelDto } from './dto/create-grade-level.dto';
import { UpdateGradeLevelDto } from './dto/update-grade-level.dto';
import { GradeLevelEntity } from './entities/grade-level.entity';

// SUPER_ADMIN only (F-06: "Manage grade-level & subject taxonomy").
//
// @BypassTenantScope() is required for the delete route: it counts Section and
// SchoolContentEntitlement rows across every tenant to decide whether the grade level is
// still referenced, and both are in TENANT_SCOPED_MODELS — SUPER_ADMIN has a null
// schoolId, so without the bypass those counts throw MissingTenantContextError (-> 500).
// findAll/create never touch a tenant-scoped model, so the bypass is a no-op for them —
// same shape as SubjectsAdminController.
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/grade-levels')
@Roles(Role.SUPER_ADMIN)
@BypassTenantScope()
export class GradeLevelsController {
  constructor(private readonly taxonomyService: TaxonomyService) {}

  @Get()
  @ApiResponse({ status: 200, type: [GradeLevelEntity] })
  findAll(): Promise<GradeLevelEntity[]> {
    return this.taxonomyService.findAllGradeLevels();
  }

  @Post()
  @ApiResponse({ status: 201, type: GradeLevelEntity })
  @ApiResponse({ status: 409, description: 'A grade level with this name or rank already exists.' })
  create(@Body() dto: CreateGradeLevelDto): Promise<GradeLevelEntity> {
    return this.taxonomyService.createGradeLevel(dto);
  }

  @Patch(':id')
  @ApiResponse({ status: 200, type: GradeLevelEntity })
  @ApiResponse({ status: 404, description: 'Grade level not found.' })
  @ApiResponse({ status: 409, description: 'A grade level with this name or rank already exists.' })
  update(@Param('id') id: string, @Body() dto: UpdateGradeLevelDto): Promise<GradeLevelEntity> {
    return this.taxonomyService.updateGradeLevel(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiResponse({ status: 204, description: 'Grade level removed.' })
  @ApiResponse({ status: 404, description: 'Grade level not found.' })
  @ApiResponse({
    status: 409,
    description:
      'The grade level is still referenced by a video, entitlement or section and cannot be deleted.',
  })
  remove(@Param('id') id: string): Promise<void> {
    return this.taxonomyService.deleteGradeLevel(id);
  }
}
