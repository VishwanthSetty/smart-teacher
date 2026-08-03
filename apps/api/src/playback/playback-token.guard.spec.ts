import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PlaybackTokenGuard } from './playback-token.guard';
import { PlaybackTokenService } from './playback-token.service';

function context(request: object): ExecutionContext {
  return { getHandler: () => function handler() {}, getClass: () => class Fixture {}, switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
}

describe('PlaybackTokenGuard', () => {
  it('does nothing on ordinary routes', () => {
    const tokens = { verify: jest.fn() };
    const guard = new PlaybackTokenGuard({ getAllAndOverride: jest.fn().mockReturnValue(false) } as unknown as Reflector, tokens as unknown as PlaybackTokenService);
    expect(guard.canActivate(context({}))).toBe(true);
    expect(tokens.verify).not.toHaveBeenCalled();
  });

  it('rejects missing and array tokens and verifies against the route video id', () => {
    const tokens = { verify: jest.fn() };
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(true) } as unknown as Reflector;
    const guard = new PlaybackTokenGuard(reflector, tokens as unknown as PlaybackTokenService);
    expect(() => guard.canActivate(context({ params: { id: 'a' }, query: { t: ['x'] } }))).toThrow(UnauthorizedException);
    const request = { params: { id: 'video-a' }, query: { t: 'token' } };
    expect(guard.canActivate(context(request))).toBe(true);
    expect(tokens.verify).toHaveBeenCalledWith('token', 'video-a');
    expect(request).toHaveProperty('playbackToken', 'token');
  });
});
