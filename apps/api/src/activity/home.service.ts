import { Injectable } from '@nestjs/common';
import { ProgressStatus, TaskStatus } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import { TeacherClassScopeService } from '../teachers/teacher-class-scope.service';
import { TasksService } from '../tasks/tasks.service';
import { BookmarksService } from './bookmarks.service';
import { ActivityQueryDto } from './dto/activity-query.dto';
import { HistoryService } from './history.service';

@Injectable()
export class HomeService {
  constructor(
    private readonly history: HistoryService,
    private readonly bookmarks: BookmarksService,
    private readonly tasks: TasksService,
    private readonly classScope: TeacherClassScopeService,
    private readonly prisma: PrismaService,
  ) {}

  async student(actor: AuthenticatedUser) {
    const recentQuery = new ActivityQueryDto();
    recentQuery.limit = 10;
    const [continueLearning, tasksDue, recent, saved] = await Promise.all([
      this.history.continueLearning(actor),
      this.tasks.studentTasks({ overdue: false }, actor),
      this.history.history(actor, recentQuery),
      this.bookmarks.list(actor),
    ]);
    return { continue: continueLearning, tasksDue: tasksDue.slice(0, 10), recent, saved: saved.slice(0, 10) };
  }

  async teacher(actor: AuthenticatedUser) {
    const sectionIds = await this.classScope.resolveSections(actor);
    const [classes, activeTasks, continuePreparation, counts] = await Promise.all([
      this.prisma.section.findMany({
        where: { id: { in: sectionIds } },
        select: { id: true, name: true, gradeLevel: { select: { id: true, name: true } } },
        orderBy: { name: 'asc' },
      }),
      this.tasks.list({ status: TaskStatus.ACTIVE }, actor),
      this.history.continueLearning(actor),
      this.prisma.taskAssignment.groupBy({
        by: ['status'],
        where: { task: { createdById: actor.sub, status: TaskStatus.ACTIVE } },
        _count: { _all: true },
      }),
    ]);
    const count = (status: ProgressStatus) =>
      counts.find((row) => row.status === status)?._count._all ?? 0;
    return {
      classes,
      activeTasks,
      completionSummary: {
        notStarted: count(ProgressStatus.NOT_STARTED),
        inProgress: count(ProgressStatus.IN_PROGRESS),
        completed: count(ProgressStatus.COMPLETED),
      },
      continuePreparation,
    };
  }
}
