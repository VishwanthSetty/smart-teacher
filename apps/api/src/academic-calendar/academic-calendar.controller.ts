import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { AcademicCalendarViewService } from './academic-calendar-view.service';
import { ViewAcademicCalendarQueryDto } from './dto/view-academic-calendar-query.dto';
import { AcademicCalendarViewEntity, CalendarPairEntity } from './entities/academic-calendar-view.entity';

// The read-only calendar teachers, students and school admins look at. SUPER_ADMIN is
// excluded: it has no school, so there is no effective calendar to resolve — platform
// defaults are read through /admin/academic-calendars.
@ApiTags('academic-calendar')
@ApiBearerAuth()
@Controller('academic-calendar')
@Roles(Role.SCHOOL_ADMIN, Role.TEACHER, Role.STUDENT)
export class AcademicCalendarController {
  constructor(private readonly view: AcademicCalendarViewService) {}

  @Get()
  @ApiResponse({ status: 200, type: AcademicCalendarViewEntity })
  @ApiResponse({ status: 404, description: 'Academic year not found, or no year covers the requested date.' })
  @ApiResponse({ status: 422, description: 'from is after to, or the range is too long.' })
  findEntries(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: ViewAcademicCalendarQueryDto,
  ): Promise<AcademicCalendarViewEntity> {
    return this.view.view(actor, query);
  }

  @Get('subjects')
  @ApiResponse({
    status: 200,
    type: [CalendarPairEntity],
    description: 'The (grade level, subject) pairs this user may view.',
  })
  findSubjects(@CurrentUser() actor: AuthenticatedUser): Promise<CalendarPairEntity[]> {
    return this.view.browsePairs(actor);
  }
}
