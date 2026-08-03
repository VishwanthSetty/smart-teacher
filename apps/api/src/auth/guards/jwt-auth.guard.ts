import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { IS_WORKER_ROUTE_KEY } from '../../common/decorators/worker-route.decorator';
import { IS_PLAYBACK_TOKEN_ROUTE_KEY } from '../../common/decorators/playback-token-route.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      // No bearer token is parsed, so request.user stays undefined and the tenant
      // context stays unpopulated — a public route that touches a tenant-scoped model
      // must go through tenantContext.runWithSystemBypass, exactly as invites does.
      return true;
    }

    const isWorkerRoute = this.reflector.getAllAndOverride<boolean>(IS_WORKER_ROUTE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isWorkerRoute) {
      // Authenticated by WorkerAuthGuard's HMAC instead of a bearer token. As with
      // @Public, request.user stays undefined and the tenant context is unpopulated, so a
      // worker route must only touch PLATFORM_GLOBAL_MODELS (Video, VideoRendition) —
      // anything tenant-scoped would need runWithSystemBypass.
      return true;
    }

    const isPlaybackTokenRoute = this.reflector.getAllAndOverride<boolean>(
      IS_PLAYBACK_TOKEN_ROUTE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isPlaybackTokenRoute) {
      return true;
    }

    return super.canActivate(context);
  }
}
