import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { PasswordsModule } from '../passwords/passwords.module';
import { TeachersController } from './teachers.controller';
import { TeacherAssignmentsController } from './teacher-assignments.controller';
import { TeachersService } from './teachers.service';
import { TeacherImportService } from './teacher-import.service';
import { TeacherAssignmentsService } from './teacher-assignments.service';
import { TeacherClassScopeService } from './teacher-class-scope.service';

@Module({
  imports: [MailModule, PasswordsModule],
  controllers: [TeachersController, TeacherAssignmentsController],
  providers: [
    TeachersService,
    TeacherImportService,
    TeacherAssignmentsService,
    TeacherClassScopeService,
  ],
  exports: [
    TeachersService,
    TeacherImportService,
    TeacherAssignmentsService,
    TeacherClassScopeService,
  ],
})
export class TeachersModule {}
