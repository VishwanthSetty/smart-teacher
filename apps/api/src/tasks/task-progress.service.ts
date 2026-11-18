import { Injectable, NotFoundException } from '@nestjs/common';
import { ProgressStatus, TaskStatus } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import { TeacherClassScopeService } from '../teachers/teacher-class-scope.service';
import type { ClassProgressQueryDto, TaskProgressQueryDto } from './dto/task-query.dto';

@Injectable()
export class TaskProgressService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly classScope: TeacherClassScopeService,
  ) {}

  async forTask(taskId: string, query: TaskProgressQueryDto, actor: AuthenticatedUser) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, createdById: actor.sub },
      select: { id: true },
    });
    if (!task) throw new NotFoundException('Task not found');
    return this.prisma.taskAssignment.findMany({
      where: { taskId, ...(query.status ? { status: query.status } : {}) },
      select: {
        id: true,
        studentId: true,
        status: true,
        completedAt: true,
        preCompletedAt: true,
        student: { select: { name: true, email: true } },
      },
      orderBy: { student: { name: 'asc' } },
    });
  }

  async classRollup(query: ClassProgressQueryDto, actor: AuthenticatedUser) {
    const sectionIds = await this.classScope.resolveSections(actor);
    if (query.sectionId && !sectionIds.includes(query.sectionId)) {
      throw new NotFoundException('Section not found');
    }
    const tasks = await this.prisma.task.findMany({
      where: {
        createdById: actor.sub,
        status: TaskStatus.ACTIVE,
        ...(query.sectionId ? { sectionId: query.sectionId } : { sectionId: { in: sectionIds } }),
        ...(query.taskId ? { id: query.taskId } : {}),
        ...(query.subjectId
          ? {
              OR: [
                { video: { node: { curriculum: { subjectId: query.subjectId } } } },
                { document: { node: { curriculum: { subjectId: query.subjectId } } } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        title: true,
        sectionId: true,
        assignments: { select: { status: true, preCompletedAt: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return tasks.map((task) => ({
      taskId: task.id,
      title: task.title,
      sectionId: task.sectionId,
      total: task.assignments.length,
      notStarted: task.assignments.filter((row) => row.status === ProgressStatus.NOT_STARTED).length,
      inProgress: task.assignments.filter((row) => row.status === ProgressStatus.IN_PROGRESS).length,
      completed: task.assignments.filter((row) => row.status === ProgressStatus.COMPLETED).length,
      preCompleted: task.assignments.filter((row) => row.preCompletedAt !== null).length,
    }));
  }
}
