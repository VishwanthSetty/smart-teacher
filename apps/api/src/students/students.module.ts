import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { EnrollmentLookupModule } from './enrollment-lookup.module';
import { PasswordsModule } from '../passwords/passwords.module';
import { StudentsController } from './students.controller';
import { SectionsController } from './sections.controller';
import { StudentsService } from './students.service';
import { SectionsService } from './sections.service';
import { EnrollmentsService } from './enrollments.service';
import { StudentImportService } from './student-import.service';
import { TasksModule } from '../tasks/tasks.module';

@Module({
  imports: [MailModule, PasswordsModule, TasksModule, EnrollmentLookupModule],
  controllers: [StudentsController, SectionsController],
  providers: [StudentsService, SectionsService, EnrollmentsService, StudentImportService],
  // SectionsService supplies the tenant-scoped section count to the dashboard stats
  // aggregator; the lookup module is re-exported so importers reach the enrollment reads
  // through StudentsModule as before.
  exports: [EnrollmentsService, SectionsService, EnrollmentLookupModule],
})
export class StudentsModule {}
