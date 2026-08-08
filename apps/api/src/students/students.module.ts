import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { PasswordsModule } from '../passwords/passwords.module';
import { StudentsController } from './students.controller';
import { SectionsController } from './sections.controller';
import { StudentsService } from './students.service';
import { SectionsService } from './sections.service';
import { EnrollmentsService } from './enrollments.service';
import { StudentImportService } from './student-import.service';

@Module({
  imports: [MailModule, PasswordsModule],
  controllers: [StudentsController, SectionsController],
  providers: [StudentsService, SectionsService, EnrollmentsService, StudentImportService],
  // EnrollmentsService narrows STUDENT content scope; SectionsService supplies the
  // tenant-scoped section count to the dashboard stats aggregator.
  exports: [EnrollmentsService, SectionsService],
})
export class StudentsModule {}
