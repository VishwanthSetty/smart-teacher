import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { IS_WORKER_ROUTE_KEY } from '../decorators/worker-route.decorator';
import { IS_PLAYBACK_TOKEN_ROUTE_KEY } from '../decorators/playback-token-route.decorator';
import type { AuthenticatedUser } from '../../auth/types/authenticated-user.interface';

@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const isWorkerRoute = this.reflector.getAllAndOverride<boolean>(IS_WORKER_ROUTE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    // Not undeclared — declared as belonging to the transcode worker, which has no Role
    // to check. WorkerAuthGuard runs after this one and rejects anything unsigned.
    if (isWorkerRoute) {
      return true;
    }

    const isPlaybackTokenRoute = this.reflector.getAllAndOverride<boolean>(
      IS_PLAYBACK_TOKEN_ROUTE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isPlaybackTokenRoute) {
      return true;
    }

    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Deny by default: an undeclared route is a bug, not an open route. Logged as an
    // error because it can only be a missing decorator, never a client mistake.
    if (!requiredRoles || requiredRoles.length === 0) {
      const handler = context.getHandler();
      const klass = context.getClass();
      this.logger.error(
        `Denied ${klass.name}.${handler.name}: no @Roles/@AnyRole/@Public declared on this route.`,
      );
      return false;
    }

    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;

    return !!user && requiredRoles.includes(user.role);
  }
}
