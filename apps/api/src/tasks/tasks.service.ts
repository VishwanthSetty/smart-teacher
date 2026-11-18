import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  ContentAudience,
  EnrollmentStatus,
  NotificationType,
  Prisma,
  ProgressStatus,
  ResourceType,
  Role,
  TaskStatus,
  UserStatus,
} from '@prisma/client';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { actorScopeOf, requireReadable } from '../common/authorization/resource-access';
import { DocumentsService } from '../documents/documents.service';
import { ActorContentScopeService } from '../entitlements/actor-content-scope.service';
import { NotificationsService, type NotificationInput } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { EnrollmentLookupService } from '../students/enrollment-lookup.service';
import { TeacherClassScopeService } from '../teachers/teacher-class-scope.service';
import { VideosService } from '../videos/videos.service';
import type { CreateTaskDto } from './dto/create-task.dto';
import type { ListTasksQueryDto, StudentTasksQueryDto } from './dto/task-query.dto';
import type { UpdateTaskDto } from './dto/update-task.dto';
import { TaskFanoutService } from './task-fanout.service';
import { TasksAccessPolicy } from './tasks-access.policy';

type TaskSyncTx = Pick<PrismaService, 'taskAssignment'>;

const TASK_DETAIL_SELECT = {
  id: true,
  title: true,
  instructions: true,
  dueAt: true,
  resourceType: true,
  videoId: true,
  documentId: true,
  status: true,
  cancelledAt: true,
  sectionId: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
  video: { select: { id: true, title: true } },
  document: { select: { id: true, title: true } },
  assignments: {
    select: {
      id: true,
      studentId: true,
      status: true,
      completedAt: true,
      preCompletedAt: true,
    },
  },
} as const satisfies Prisma.TaskSelect;

type TaskDetail = Prisma.TaskGetPayload<{ select: typeof TASK_DETAIL_SELECT }>;

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly videos: VideosService,
    private readonly documents: DocumentsService,
    private readonly contentScope: ActorContentScopeService,
    private readonly classScope: TeacherClassScopeService,
    private readonly accessPolicy: TasksAccessPolicy,
    private readonly fanout: TaskFanoutService,
    private readonly notifications: NotificationsService,
    private readonly enrollmentLookup: EnrollmentLookupService,
  ) {}

  async create(dto: CreateTaskDto, actor: AuthenticatedUser) {
    if (!actor.schoolId) throw new BadRequestException('A tenant account is required');
    const schoolId = actor.schoolId;
    const curriculumId = await this.resolveAssignableResource(dto.resourceType, dto.resourceId, actor);
    const recipients = await this.resolveRecipients(dto, actor);
    const unreachable: string[] = [];
    const students = await this.prisma.user.findMany({
      where: {
        id: { in: recipients },
        role: Role.STUDENT,
        status: UserStatus.ACTIVE,
      },
      select: { id: true, email: true, name: true, role: true, schoolId: true },
    });
    for (const student of students) {
      const canReach = await this.contentScope.includes(
        { userId: student.id, role: student.role, schoolId: student.schoolId },
        curriculumId,
      );
      if (!canReach) unreachable.push(student.id);
    }
    if (unreachable.length > 0) {
      throw new UnprocessableEntityException({
        message: 'Some students cannot access this resource',
        studentIds: unreachable,
      });
    }

    let notificationInputs: NotificationInput[] = [];
    const task = await this.prisma.$transaction(async (tx) => {
      const created = await tx.task.create({
        data: {
          schoolId,
          createdById: actor.sub,
          title: dto.title,
          instructions: dto.instructions,
          dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
          resourceType: dto.resourceType,
          videoId: dto.resourceType === ResourceType.VIDEO ? dto.resourceId : null,
          documentId: dto.resourceType === ResourceType.DOCUMENT ? dto.resourceId : null,
          sectionId: dto.sectionId ?? null,
        },
      });
      notificationInputs = await this.fanout.fanOut(tx, {
        schoolId,
        taskId: created.id,
        taskTitle: created.title,
        resourceType: created.resourceType,
        resourceId: dto.resourceId,
        studentIds: recipients,
      });
      return tx.task.findUniqueOrThrow({ where: { id: created.id }, select: TASK_DETAIL_SELECT });
    });
    await Promise.all(notificationInputs.map((input) => this.notifications.deliverTo(input.userId, input)));
    return task;
  }

  list(query: ListTasksQueryDto, actor: AuthenticatedUser) {
    return this.prisma.task.findMany({
      where: {
        createdById: actor.sub,
        ...(query.status ? { status: query.status } : {}),
        ...(query.sectionId ? { sectionId: query.sectionId } : {}),
        ...(query.subjectId
          ? {
              OR: [
                { video: { node: { curriculum: { subjectId: query.subjectId } } } },
                { document: { node: { curriculum: { subjectId: query.subjectId } } } },
              ],
            }
          : {}),
      },
      select: TASK_DETAIL_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findTeacherTask(id: string, actor: AuthenticatedUser): Promise<TaskDetail> {
    const row = await this.prisma.task.findUnique({ where: { id }, select: TASK_DETAIL_SELECT });
    return requireReadable<TaskDetail>(row, actorScopeOf(actor), this.accessPolicy, 'Task not found');
  }

  async update(id: string, dto: UpdateTaskDto, actor: AuthenticatedUser) {
    await this.findTeacherTask(id, actor);
    return this.prisma.task.update({
      where: { id },
      data: {
        title: dto.title,
        instructions: dto.instructions,
        dueAt: dto.dueAt === null ? null : dto.dueAt ? new Date(dto.dueAt) : undefined,
      },
      select: TASK_DETAIL_SELECT,
    });
  }

  async cancel(id: string, actor: AuthenticatedUser) {
    await this.findTeacherTask(id, actor);
    return this.prisma.task.update({
      where: { id },
      data: { status: TaskStatus.CANCELLED, cancelledAt: new Date() },
      select: TASK_DETAIL_SELECT,
    });
  }

  // Narrowed to the class the student is currently in, plus tasks addressed to them
  // personally (no section), which belong to no one class. findStudentTask stays
  // unfiltered so a notification for another class still opens its task.
  async studentTasks(query: StudentTasksQueryDto, actor: AuthenticatedUser) {
    const now = new Date();
    const currentSectionId = await this.enrollmentLookup.currentSectionIdFor(actor.sub);
    return this.prisma.taskAssignment.findMany({
      where: {
        studentId: actor.sub,
        OR: [
          { task: { sectionId: null } },
          ...(currentSectionId ? [{ task: { sectionId: currentSectionId } }] : []),
        ],
        ...(query.status ? { status: query.status } : {}),
        ...(query.overdue ? { status: { not: ProgressStatus.COMPLETED }, task: { dueAt: { lt: now } } } : {}),
      },
      select: {
        id: true,
        status: true,
        completedAt: true,
        preCompletedAt: true,
        createdAt: true,
        task: { select: TASK_DETAIL_SELECT },
      },
      orderBy: { task: { dueAt: 'asc' } },
    });
  }

  async findStudentTask(id: string, actor: AuthenticatedUser): Promise<TaskDetail> {
    const row = await this.prisma.task.findUnique({ where: { id }, select: TASK_DETAIL_SELECT });
    return requireReadable<TaskDetail>(row, actorScopeOf(actor), this.accessPolicy, 'Task not found');
  }

  async studentResourceActivity(taskId: string, studentId: string, actor: AuthenticatedUser) {
    const inScope = await this.classScope.includesStudent(actor, studentId);
    if (!inScope) throw new NotFoundException('Student not found');
    const task = await this.findTeacherTask(taskId, actor);
    const assignment = task.assignments.find((row) => row.studentId === studentId);
    if (!assignment) throw new NotFoundException('Task not found');
    return this.prisma.resourceActivity.findFirst({
      where: {
        userId: studentId,
        ...(task.resourceType === ResourceType.VIDEO
          ? { videoId: task.videoId }
          : { documentId: task.documentId }),
      },
    });
  }

  async remind(id: string, actor: AuthenticatedUser): Promise<{ reminded: number }> {
    const task = await this.findTeacherTask(id, actor);
    if (task.status !== TaskStatus.ACTIVE || !actor.schoolId) return { reminded: 0 };
    const schoolId = actor.schoolId;
    const pending = task.assignments.filter((row) => row.status !== ProgressStatus.COMPLETED);
    const sentOn = utcDateOnly(new Date());
    const inputs: NotificationInput[] = [];
    await this.prisma.$transaction(async (tx) => {
      for (const assignment of pending) {
        try {
          await tx.taskReminder.create({
            data: {
              schoolId,
              taskAssignmentId: assignment.id,
              sentById: actor.sub,
              sentOn,
            },
          });
          inputs.push({
            schoolId,
            userId: assignment.studentId,
            type: NotificationType.TASK_REMINDER,
            title: 'Task reminder',
            body: task.title,
            data: { taskId: task.id },
          });
        } catch (error) {
          if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
            throw error;
          }
        }
      }
      await this.notifications.createMany(tx, inputs);
    });
    await Promise.all(inputs.map((input) => this.notifications.deliverTo(input.userId, input)));
    return { reminded: inputs.length };
  }

  async syncForResource(
    tx: TaskSyncTx,
    studentId: string,
    resourceType: ResourceType,
    resourceId: string,
    status: ProgressStatus,
    completedAt: Date | null,
  ): Promise<void> {
    await tx.taskAssignment.updateMany({
      where: {
        studentId,
        task: {
          status: TaskStatus.ACTIVE,
          resourceType,
          ...(resourceType === ResourceType.VIDEO ? { videoId: resourceId } : { documentId: resourceId }),
        },
      },
      data: { status, completedAt: status === ProgressStatus.COMPLETED ? completedAt : null },
    });
  }

  async backfillForNewEnrollment(
    tx: Pick<PrismaService, 'task' | 'resourceActivity' | 'taskAssignment' | 'notification'>,
    schoolId: string,
    studentId: string,
    sectionId: string,
  ): Promise<void> {
    const tasks = await tx.task.findMany({
      where: {
        sectionId,
        status: TaskStatus.ACTIVE,
        OR: [{ dueAt: null }, { dueAt: { gt: new Date() } }],
      },
      select: { id: true, title: true, resourceType: true, videoId: true, documentId: true },
    });
    for (const task of tasks) {
      const resourceId = task.videoId ?? task.documentId;
      if (!resourceId) continue;
      await this.fanout.fanOut(tx, {
        schoolId,
        taskId: task.id,
        taskTitle: task.title,
        resourceType: task.resourceType,
        resourceId,
        studentIds: [studentId],
      });
    }
  }

  private async resolveAssignableResource(
    type: ResourceType,
    id: string,
    actor: AuthenticatedUser,
  ): Promise<string> {
    const resource =
      type === ResourceType.VIDEO
        ? await this.videos.findOneVisibleTo(id, actor)
        : await this.documents.findOneVisibleTo(id, actor);
    const curriculum = await this.prisma.curriculum.findUnique({
      where: { id: resource.curriculumId },
      select: { audience: true },
    });
    if (!curriculum) throw new NotFoundException('Resource not found');
    if (curriculum.audience !== ContentAudience.STUDENT) {
      throw new BadRequestException('Only student-audience resources can be assigned');
    }
    return resource.curriculumId;
  }

  private async resolveRecipients(dto: CreateTaskDto, actor: AuthenticatedUser): Promise<string[]> {
    if ((dto.sectionId ? 1 : 0) + (dto.studentIds?.length ? 1 : 0) !== 1) {
      throw new BadRequestException('Choose either a section or one or more students');
    }
    const allowedSections = await this.classScope.resolveSections(actor);
    const allowedStudents = await this.classScope.resolveStudents(actor);
    if (dto.sectionId) {
      if (!allowedSections.includes(dto.sectionId)) throw new NotFoundException('Section not found');
      const rows = await this.prisma.enrollment.findMany({
        where: { sectionId: dto.sectionId, status: EnrollmentStatus.ACTIVE },
        select: { userId: true },
      });
      return rows.map((row) => row.userId);
    }
    const requested = dto.studentIds ?? [];
    if (requested.some((studentId) => !allowedStudents.includes(studentId))) {
      throw new NotFoundException('Student not found');
    }
    return requested;
  }
}

function utcDateOnly(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}
