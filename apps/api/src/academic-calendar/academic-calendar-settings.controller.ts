import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { SchoolAcademicCalendarsService } from './school-academic-calendars.service';
import { UpdateCalendarSettingDto } from './dto/update-calendar-setting.dto';
import { AcademicCalendarSettingEntity } from './entities/school-calendar-overview.entity';

// The per-year opt-in. Its own path rather than /school-academic-calendars/settings so
// the literal segment can never be shadowed by that controller's /:id routes.
@ApiTags('academic-calendar')
@ApiBearerAuth()
@Controller('academic-calendar-settings')
@Roles(Role.SCHOOL_ADMIN)
export class AcademicCalendarSettingsController {
  constructor(private readonly calendars: SchoolAcademicCalendarsService) {}

  @Get()
  @ApiResponse({
    status: 200,
    type: [AcademicCalendarSettingEntity],
    description: 'One row per academic year; a year never configured reports enabled.',
  })
  findAll(): Promise<AcademicCalendarSettingEntity[]> {
    return this.calendars.listSettings();
  }

  // PUT: the body is the whole setting, and repeating it is idempotent.
  @Put(':academicYearId')
  @ApiResponse({ status: 200, type: AcademicCalendarSettingEntity })
  @ApiResponse({ status: 404, description: 'Academic year not found.' })
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('academicYearId') academicYearId: string,
    @Body() dto: UpdateCalendarSettingDto,
  ): Promise<AcademicCalendarSettingEntity> {
    return this.calendars.updateSetting(actor, academicYearId, dto.isEnabled);
  }
}
