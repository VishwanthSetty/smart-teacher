import { Injectable } from '@nestjs/common';
import type { ActorScope, ResourceAccessPolicy } from '../common/authorization/resource-access';

export interface TaskAccessResource {
  createdById: string;
  assignments?: ReadonlyArray<{ studentId: string }>;
}

@Injectable()
export class TasksAccessPolicy implements ResourceAccessPolicy<TaskAccessResource> {
  canRead(actor: ActorScope, task: TaskAccessResource): boolean {
    return (
      task.createdById === actor.userId ||
      (task.assignments?.some((assignment) => assignment.studentId === actor.userId) ?? false)
    );
  }
}
