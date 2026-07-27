import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AnyRole } from '../common/decorators/roles.decorator';
import { TaxonomyService } from './taxonomy.service';
import { SubjectEntity } from './entities/subject.entity';

// The canonical subject list a school selects from when building timetables and
// assigning teachers (F-37). Read-only for everyone: subjects are created, edited and
// retired by the Super Admin through SubjectsAdminController.
//
// No @BypassTenantScope(), and adding one would not help — it only engages for
// SUPER_ADMIN, and this route is reachable by every role. What keeps it safe is that
// findActiveSubjects touches scalar fields only: an include, select or _count of the
// `entitlements` relation would reach a tenant-scoped model, throwing for SUPER_ADMIN
// (null schoolId -> 500) and silently narrowing the canonical list to a single tenant
// for everyone else. Keep this read path free of relations.
@ApiTags('taxonomy')
@ApiBearerAuth()
@Controller('subjects')
@AnyRole()
export class SubjectsController {
  constructor(private readonly taxonomyService: TaxonomyService) {}

  @Get()
  @ApiResponse({ status: 200, type: [SubjectEntity], description: 'Active subjects only.' })
  findAll(): Promise<SubjectEntity[]> {
    return this.taxonomyService.findActiveSubjects();
  }
}
