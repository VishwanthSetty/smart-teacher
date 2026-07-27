import { Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { ActorScope, ResourceAccessPolicy } from '../common/authorization/resource-access';

export interface ReadableUser {
  id: string;
}

// A tenant admin may read anyone the tenant guard already scoped them to; everyone
// else may read only themselves. No DB lookup needed, so nothing here depends on
// tenant-context ordering.
@Injectable()
export class UsersAccessPolicy implements ResourceAccessPolicy<ReadableUser> {
  canRead(actor: ActorScope, user: ReadableUser): boolean {
    return actor.role === Role.SCHOOL_ADMIN || actor.userId === user.id;
  }
}
