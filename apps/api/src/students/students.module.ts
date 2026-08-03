import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { InvitesModule } from '../invites/invites.module';
import { StudentsController } from './students.controller';
import { SectionsController } from './sections.controller';
import { StudentsService } from './students.service';
import { SectionsService } from './sections.service';
import { EnrollmentsService } from './enrollments.service';
import { StudentImportService } from './student-import.service';

@Module({
  imports: [MailModule, InvitesModule],
  controllers: [StudentsController, SectionsController],
  providers: [StudentsService, SectionsService, EnrollmentsService, StudentImportService],
  // EnrollmentsService is the seam ActorContentScopeService narrows STUDENT content
  // scope through — nothing else outside this module should need it.
  exports: [EnrollmentsService],
})
export class StudentsModule {}
