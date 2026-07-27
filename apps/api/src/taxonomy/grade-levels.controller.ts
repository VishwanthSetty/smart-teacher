import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { TaxonomyService } from './taxonomy.service';
import { CreateGradeLevelDto } from './dto/create-grade-level.dto';
import { GradeLevelEntity } from './entities/grade-level.entity';

// SUPER_ADMIN only (F-06: "Manage grade-level & subject taxonomy").
//
// No @BypassTenantScope(): GradeLevel is in PLATFORM_GLOBAL_MODELS and carries no
// schoolId, so the tenant guard's isTenantScoped check never fires. That holds only
// while no query here includes the `entitlements` relation, which would reach a
// tenant-scoped model this caller has no tenant for.
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/grade-levels')
@Roles(Role.SUPER_ADMIN)
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
}
