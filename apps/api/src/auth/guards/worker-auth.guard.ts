import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { IS_WORKER_ROUTE_KEY } from '../../common/decorators/worker-route.decorator';
import {
  WORKER_NONCE_HEADER,
  WORKER_SIGNATURE_HEADER,
  WORKER_TIMESTAMP_HEADER,
  isValidWorkerSignature,
  signWorkerPayload,
} from './worker-signature';

interface SignedRequest {
  headers: Record<string, string | string[] | undefined>;
  rawBody?: Buffer;
}

/**
 * Authenticates the transcode worker on routes marked @WorkerRoute().
 *
 * Registered globally rather than with @UseGuards on the controller: as a per-controller
 * guard, marking a route @WorkerRoute() and forgetting @UseGuards would leave it wide
 * open — a two-decorator invariant nothing enforces. Global makes it structural, and it
 * is the same shape RolesGuard already uses (a global guard reading route metadata and
 * no-opping everywhere else).
 *
 * HMAC rather than a bearer secret because the worker is designed to run on a laptop
 * whose network path nobody controls. A bearer secret crosses the wire whole on every
 * callback, so a single captured request would grant the ability to flip any video to
 * READY pointing at keys of the caller's choosing. With an HMAC the secret never leaves
 * either end, and a captured request replays only itself.
 */
@Injectable()
export class WorkerAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isWorkerRoute = this.reflector.getAllAndOverride<boolean>(IS_WORKER_ROUTE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!isWorkerRoute) {
      return true;
    }

    const request = context.switchToHttp().getRequest<SignedRequest>();

    const timestamp = headerValue(request, WORKER_TIMESTAMP_HEADER);
    const nonce = headerValue(request, WORKER_NONCE_HEADER);
    const presented = headerValue(request, WORKER_SIGNATURE_HEADER);
    const rawBody = request.rawBody;

    if (timestamp === null || nonce === null || presented === null || rawBody === undefined) {
      throw this.reject();
    }
    if (!this.isFresh(timestamp)) {
      throw this.reject();
    }

    const expected = signWorkerPayload(
      this.configService.getOrThrow<string>('WORKER_CALLBACK_SECRET'),
      timestamp,
      nonce,
      rawBody.toString('utf8'),
    );

    if (!isValidWorkerSignature(presented, expected)) {
      throw this.reject();
    }

    return true;
  }

  /**
   * The replay window. The nonce is signed and travels with the request but is not stored
   * server-side: a nonce set would have to be shared across API replicas, meaning the API
   * grows a Redis *read* dependency it otherwise has no need for (it only produces jobs),
   * to stop a replay whose only possible effect is re-posting a result
   * TranscodeCallbackService already treats as a no-op. Keeping the nonce in the protocol
   * from day one means enforcing it later needs no worker redeploy.
   */
  private isFresh(timestamp: string): boolean {
    if (!/^\d{1,10}$/.test(timestamp)) {
      return false;
    }
    const skewSecs = this.configService.getOrThrow<number>('TRANSCODE_CALLBACK_SKEW_SECS');
    const driftSecs = Math.abs(Date.now() / 1000 - Number(timestamp));
    return driftSecs <= skewSecs;
  }

  // One message for missing, malformed, stale and mismatched alike — distinguishing them
  // would tell a prober which part of the scheme they got right.
  private reject(): UnauthorizedException {
    return new UnauthorizedException('Worker authentication failed');
  }
}

function headerValue(request: SignedRequest, name: string): string | null {
  const value = request.headers[name];
  return typeof value === 'string' && value.length > 0 ? value : null;
}
