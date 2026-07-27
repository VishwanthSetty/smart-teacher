import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { BypassTenantScope } from '../tenancy/decorators/bypass-tenant-scope.decorator';
import { TaxonomyService } from './taxonomy.service';
import { CreateSubjectDto } from './dto/create-subject.dto';
import { UpdateSubjectDto } from './dto/update-subject.dto';
import { SubjectEntity } from './entities/subject.entity';

// The Super Admin's half of the canonical subject taxonomy (F-06: "Manage grade-level &
// subject taxonomy", F-37). Schools only ever read it, via SubjectsController.
//
// @BypassTenantScope() is required, not optional: retiring a subject counts
// SchoolContentEntitlement rows across every tenant, that model is in
// TENANT_SCOPED_MODELS, and SUPER_ADMIN has a null schoolId — so without the bypass the
// count throws MissingTenantContextError (-> 500). The bypass only engages for
// SUPER_ADMIN (TenantContextInterceptor checks the role too), and no route here accepts
// a school id, so this is a platform-wide read by construction rather than one tenant's.
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/subjects')
@Roles(Role.SUPER_ADMIN)
@BypassTenantScope()
export class SubjectsAdminController {
  constructor(private readonly taxonomyService: TaxonomyService) {}

  @Get()
  @ApiResponse({ status: 200, type: [SubjectEntity], description: 'Includes retired subjects.' })
  findAll(): Promise<SubjectEntity[]> {
    return this.taxonomyService.findAllSubjects();
  }

  @Post()
  @ApiResponse({ status: 201, type: SubjectEntity })
  @ApiResponse({ status: 409, description: 'A subject with this code already exists.' })
  create(@Body() dto: CreateSubjectDto): Promise<SubjectEntity> {
    return this.taxonomyService.createSubject(dto);
  }

  @Patch(':id')
  @ApiResponse({ status: 200, type: SubjectEntity })
  @ApiResponse({ status: 404, description: 'Subject not found.' })
  @ApiResponse({
    status: 409,
    description: 'The subject is still referenced by a video or entitlement and cannot be retired.',
  })
  update(@Param('id') id: string, @Body() dto: UpdateSubjectDto): Promise<SubjectEntity> {
    return this.taxonomyService.updateSubject(id, dto);
  }
}
