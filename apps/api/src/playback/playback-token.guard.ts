import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PLAYBACK_TOKEN_ROUTE_KEY } from '../common/decorators/playback-token-route.decorator';
import { PlaybackTokenService, videoPrefix } from './playback-token.service';

interface PlaybackRequest {
  params: { id?: string };
  query: { t?: unknown };
  playbackToken?: string;
}

@Injectable()
export class PlaybackTokenGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: PlaybackTokenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const enabled = this.reflector.getAllAndOverride<boolean>(IS_PLAYBACK_TOKEN_ROUTE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!enabled) return true;
    const request = context.switchToHttp().getRequest<PlaybackRequest>();
    const token = request.query.t;
    const videoId = request.params.id;
    if (typeof token !== 'string' || token.length === 0 || typeof videoId !== 'string') {
      throw new UnauthorizedException('Playback authentication failed');
    }
    await this.tokens.verify(token, videoPrefix(videoId));
    request.playbackToken = token;
    return true;
  }
}
