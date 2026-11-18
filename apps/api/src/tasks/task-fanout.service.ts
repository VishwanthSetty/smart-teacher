import { Injectable } from '@nestjs/common';
import { NotificationType, ProgressStatus, ResourceType } from '@prisma/client';
import { NotificationsService, type NotificationInput } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

type FanoutTx = Pick<PrismaService, 'resourceActivity' | 'taskAssignment' | 'notification'>;

@Injectable()
export class TaskFanoutService {
  constructor(private readonly notifications: NotificationsService) {}

  async fanOut(
    tx: FanoutTx,
    input: {
      schoolId: string;
      taskId: string;
      taskTitle: string;
      resourceType: ResourceType;
      resourceId: string;
      studentIds: readonly string[];
    },
  ): Promise<NotificationInput[]> {
    if (input.studentIds.length === 0) return [];
    const activities = await tx.resourceActivity.findMany({
      where: {
        userId: { in: [...input.studentIds] },
        ...(input.resourceType === ResourceType.VIDEO
          ? { videoId: input.resourceId }
          : { documentId: input.resourceId }),
      },
      select: { userId: true, status: true, completedAt: true },
    });
    const completedByStudent = new Map(
      activities
        .filter((activity) => activity.status === ProgressStatus.COMPLETED)
        .map((activity) => [activity.userId, activity.completedAt]),
    );
    await tx.taskAssignment.createMany({
      data: input.studentIds.map((studentId) => ({
        schoolId: input.schoolId,
        taskId: input.taskId,
        studentId,
        status: completedByStudent.has(studentId)
          ? ProgressStatus.COMPLETED
          : ProgressStatus.NOT_STARTED,
        completedAt: completedByStudent.get(studentId) ?? null,
        preCompletedAt: completedByStudent.get(studentId) ?? null,
      })),
      skipDuplicates: true,
    });
    const notificationInputs = input.studentIds.map((studentId) => ({
      schoolId: input.schoolId,
      userId: studentId,
      type: NotificationType.TASK_ASSIGNED,
      title: 'New learning task',
      body: input.taskTitle,
      data: { taskId: input.taskId },
    }));
    await this.notifications.createMany(tx, notificationInputs);
    return notificationInputs;
  }
}
