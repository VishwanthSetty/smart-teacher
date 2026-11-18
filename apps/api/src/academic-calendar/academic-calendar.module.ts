import { Module } from '@nestjs/common';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { AcademicCalendarController } from './academic-calendar.controller';
import { AcademicCalendarScopeService } from './academic-calendar-scope.service';
import { AcademicCalendarSettingsController } from './academic-calendar-settings.controller';
import { AcademicCalendarViewService } from './academic-calendar-view.service';
import { AcademicYearsAdminController } from './academic-years-admin.controller';
import { AcademicYearsController } from './academic-years.controller';
import { AcademicYearsService } from './academic-years.service';
import { PlatformAcademicCalendarsAdminController } from './platform-academic-calendars-admin.controller';
import { PlatformAcademicCalendarsService } from './platform-academic-calendars.service';
import { SchoolAcademicCalendarAccessPolicy } from './school-academic-calendar-access.policy';
import { SchoolAcademicCalendarsController } from './school-academic-calendars.controller';
import { SchoolAcademicCalendarsService } from './school-academic-calendars.service';

// Nothing is exported yet. When entries link to lessons and videos, the view service is
// what the home feed would import for "today's plan".
@Module({
  imports: [EntitlementsModule],
  controllers: [
    AcademicYearsController,
    AcademicYearsAdminController,
    PlatformAcademicCalendarsAdminController,
    SchoolAcademicCalendarsController,
    AcademicCalendarSettingsController,
    AcademicCalendarController,
  ],
  providers: [
    AcademicYearsService,
    AcademicCalendarScopeService,
    PlatformAcademicCalendarsService,
    SchoolAcademicCalendarsService,
    SchoolAcademicCalendarAccessPolicy,
    AcademicCalendarViewService,
  ],
})
export class AcademicCalendarModule {}
