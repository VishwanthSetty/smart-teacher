import { Body, Controller, Delete, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { BypassTenantScope } from '../tenancy/decorators/bypass-tenant-scope.decorator';
import { AcademicYearsService } from './academic-years.service';
import { CreateAcademicYearDto } from './dto/create-academic-year.dto';
import { UpdateAcademicYearDto } from './dto/update-academic-year.dto';
import { AcademicYearEntity } from './entities/academic-year.entity';

// @BypassTenantScope() is required, not optional: narrowing a year and deleting one both
// count SchoolAcademicCalendar* rows across every tenant, those models are in
// TENANT_SCOPED_MODELS, and SUPER_ADMIN has a null schoolId. The bypass only engages for
// SUPER_ADMIN, and no route here accepts a school id.
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/academic-years')
@Roles(Role.SUPER_ADMIN)
@BypassTenantScope()
export class AcademicYearsAdminController {
  constructor(private readonly years: AcademicYearsService) {}

  @Post()
  @ApiResponse({ status: 201, type: AcademicYearEntity })
  @ApiResponse({ status: 409, description: 'The label is taken.' })
  @ApiResponse({ status: 422, description: 'startDate is not before endDate.' })
  create(@Body() dto: CreateAcademicYearDto): Promise<AcademicYearEntity> {
    return this.years.create(dto);
  }

  @Patch(':id')
  @ApiResponse({ status: 200, type: AcademicYearEntity })
  @ApiResponse({ status: 404, description: 'Academic year not found.' })
  @ApiResponse({ status: 409, description: 'The label is taken, or entries would fall outside the new dates.' })
  @ApiResponse({ status: 422, description: 'startDate is not before endDate.' })
  update(@Param('id') id: string, @Body() dto: UpdateAcademicYearDto): Promise<AcademicYearEntity> {
    return this.years.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 404, description: 'Academic year not found.' })
  @ApiResponse({ status: 409, description: 'Calendars or school settings still reference it.' })
  remove(@Param('id') id: string): Promise<void> {
    return this.years.remove(id);
  }
}
