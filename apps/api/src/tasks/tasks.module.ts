import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { EnrollmentLookupModule } from '../students/enrollment-lookup.module';
import { TeachersModule } from '../teachers/teachers.module';
import { VideosModule } from '../videos/videos.module';
import { StudentTasksController } from './student-tasks.controller';
import { TaskFanoutService } from './task-fanout.service';
import { TaskProgressService } from './task-progress.service';
import { TasksController, TeacherProgressController } from './tasks.controller';
import { TasksAccessPolicy } from './tasks-access.policy';
import { TasksService } from './tasks.service';

@Module({
  imports: [
    VideosModule,
    DocumentsModule,
    EntitlementsModule,
    TeachersModule,
    NotificationsModule,
    EnrollmentLookupModule,
  ],
  controllers: [TasksController, StudentTasksController, TeacherProgressController],
  providers: [TasksService, TaskFanoutService, TaskProgressService, TasksAccessPolicy],
  exports: [TasksService],
})
export class TasksModule {}
