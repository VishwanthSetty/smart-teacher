import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AnyRole } from '../common/decorators/roles.decorator';
import { TaxonomyService } from './taxonomy.service';
import { GradeLevelEntity } from './entities/grade-level.entity';

// The canonical grade-level list a school selects from when creating a section — the
// same read-only-for-everyone shape as SubjectsController. Grade levels are created,
// renamed and ranked by the Super Admin through GradeLevelsController.
//
// No @BypassTenantScope(), same reasoning as SubjectsController: findAllGradeLevels
// touches scalar fields only, so it never reaches the tenant-scoped Section relation.
@ApiTags('taxonomy')
@ApiBearerAuth()
@Controller('grade-levels')
@AnyRole()
export class GradeLevelsReadController {
  constructor(private readonly taxonomyService: TaxonomyService) {}

  @Get()
  @ApiResponse({ status: 200, type: [GradeLevelEntity] })
  findAll(): Promise<GradeLevelEntity[]> {
    return this.taxonomyService.findAllGradeLevels();
  }
}
