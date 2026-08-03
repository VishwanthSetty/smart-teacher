import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlaybackTokenService } from './playback-token.service';

const config = (secret = 'a'.repeat(32)) => ({
  getOrThrow: jest.fn((key: string) => key === 'PLAYBACK_TOKEN_TTL_SECS' ? 14400 : secret),
}) as unknown as ConfigService;

describe('PlaybackTokenService', () => {
  it('round-trips and binds a token to one video', () => {
    const service = new PlaybackTokenService(config());
    const { token } = service.mint('video-a', 'user-1');
    expect(() => service.verify(token, 'video-a')).not.toThrow();
    expect(() => service.verify(token, 'video-b')).toThrow(UnauthorizedException);
  });

  it('rejects tampering, a wrong secret, expiration, and malformed shapes as 401', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const service = new PlaybackTokenService(config());
    const { token } = service.mint('video-a', 'user-1');
    const malformed = ['', 'st1', 'st1.a.b.c', `${token.slice(0, -1)}x`];
    for (const value of malformed) expect(() => service.verify(value, 'video-a')).toThrow(UnauthorizedException);
    expect(() => new PlaybackTokenService(config('b'.repeat(32))).verify(token, 'video-a')).toThrow(UnauthorizedException);
    jest.advanceTimersByTime(14400 * 1000);
    expect(() => service.verify(token, 'video-a')).toThrow(UnauthorizedException);
    jest.useRealTimers();
  });
});
