import { createParamDecorator, ExecutionContext } from '@nestjs/common';

interface TokenizedRequest {
  playbackToken?: string;
}

export const CurrentPlaybackToken = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const request = context.switchToHttp().getRequest<TokenizedRequest>();
    return request.playbackToken ?? '';
  },
);
