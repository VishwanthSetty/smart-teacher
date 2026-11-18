import { Test, TestingModule } from '@nestjs/testing';
import { Role } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { DocumentsService } from '../documents/documents.service';
import { ActorContentScopeService } from '../entitlements/actor-content-scope.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { EnrollmentLookupService } from '../students/enrollment-lookup.service';
import { TeacherClassScopeService } from '../teachers/teacher-class-scope.service';
import { VideosService } from '../videos/videos.service';
import { TaskFanoutService } from './task-fanout.service';
import { TasksAccessPolicy } from './tasks-access.policy';
import { TasksService } from './tasks.service';

const STUDENT: AuthenticatedUser = {
  sub: 'student-1',
  email: 'student@smartteacher.dev',
  name: 'Student',
  role: Role.STUDENT,
  schoolId: 'school-1',
};

describe('TasksService', () => {
  let service: TasksService;
  let prisma: { taskAssignment: { findMany: jest.Mock } };
  let enrollmentLookup: { currentSectionIdFor: jest.Mock };

  beforeEach(async () => {
    prisma = { taskAssignment: { findMany: jest.fn().mockResolvedValue([]) } };
    enrollmentLookup = { currentSectionIdFor: jest.fn() };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: PrismaService, useValue: prisma },
        { provide: EnrollmentLookupService, useValue: enrollmentLookup },
        { provide: VideosService, useValue: {} },
        { provide: DocumentsService, useValue: {} },
        { provide: ActorContentScopeService, useValue: {} },
        { provide: TeacherClassScopeService, useValue: {} },
        { provide: TasksAccessPolicy, useValue: {} },
        { provide: TaskFanoutService, useValue: {} },
        { provide: NotificationsService, useValue: {} },
      ],
    }).compile();
    service = moduleRef.get(TasksService);
  });

  describe('studentTasks', () => {
    it("lists the current class's tasks plus personally addressed ones, never another class's", async () => {
      enrollmentLookup.currentSectionIdFor.mockResolvedValue('section-a');

      await service.studentTasks({}, STUDENT);

      expect(enrollmentLookup.currentSectionIdFor).toHaveBeenCalledWith('student-1');
      expect(prisma.taskAssignment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            studentId: 'student-1',
            OR: [{ task: { sectionId: null } }, { task: { sectionId: 'section-a' } }],
          }),
        }),
      );
    });

    it('lists only personally addressed tasks for a student with no class', async () => {
      enrollmentLookup.currentSectionIdFor.mockResolvedValue(null);

      await service.studentTasks({}, STUDENT);

      expect(prisma.taskAssignment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ OR: [{ task: { sectionId: null } }] }),
        }),
      );
    });
  });
});
