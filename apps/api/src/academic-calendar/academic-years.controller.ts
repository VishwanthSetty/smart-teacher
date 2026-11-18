import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AnyRole } from '../common/decorators/roles.decorator';
import { AcademicYearsService } from './academic-years.service';
import { AcademicYearEntity } from './entities/academic-year.entity';

// The year picker every role reads. No @BypassTenantScope(): the read selects
// AcademicYear scalars only, so it never reaches the tenant-scoped back-relations.
@ApiTags('academic-calendar')
@ApiBearerAuth()
@Controller('academic-years')
@AnyRole()
export class AcademicYearsController {
  constructor(private readonly years: AcademicYearsService) {}

  @Get()
  @ApiResponse({ status: 200, type: [AcademicYearEntity], description: 'Newest first.' })
  findAll(): Promise<AcademicYearEntity[]> {
    return this.years.findAll();
  }
}
