import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { generateKeyPairSync } from 'node:crypto';
import { PlaybackTokenService } from './playback-token.service';

const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const privateKeyB64 = Buffer.from(privateKey.export({ format: 'pem', type: 'pkcs8' })).toString('base64');
const jwt = new JwtService();

function service(ttl = 600): PlaybackTokenService {
  const values: Record<string, string | number> = {
    PLAYBACK_SIGNING_PRIVATE_KEY_B64: privateKeyB64,
    PLAYBACK_SIGNING_KEY_ID: 'test-1',
    PLAYBACK_TOKEN_TTL_SECS: ttl,
  };
  const config = { getOrThrow: jest.fn((key: string) => values[key]) } as unknown as ConfigService;
  return new PlaybackTokenService(config, jwt);
}

describe('PlaybackTokenService', () => {
  it('round-trips and binds both vid and pfx to one video', async () => {
    const tokens = service();
    const { token, expiresInSecs } = await tokens.mint('video-a', 'user-1');
    expect(expiresInSecs).toBe(600);
    await expect(tokens.verify(token, 'video-a')).resolves.toBeUndefined();
    await expect(tokens.verify(token, 'video-b')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(tokens.publicJwk()).toMatchObject({ alg: 'ES256', kid: 'test-1', kty: 'EC', use: 'sig' });
  });

  it('rejects a tampered payload and an expired token', async () => {
    const tokens = service();
    const { token } = await tokens.mint('video-a', 'user-1');
    const parts = token.split('.');
    const payload = Buffer.from(JSON.stringify({ vid: 'video-a', pfx: 'videos/video-b/' })).toString('base64url');
    await expect(tokens.verify(`${parts[0]}.${payload}.${parts[2]}`, 'video-a')).rejects.toBeInstanceOf(UnauthorizedException);
    const expired = await service(-1).mint('video-a', 'user-1');
    await expect(tokens.verify(expired.token, 'video-a')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a correctly signed token whose pfx disagrees with vid', async () => {
    const token = await jwt.signAsync(
      { vid: 'video-a', pfx: 'videos/video-b/' },
      { algorithm: 'ES256', privateKey, issuer: 'smart-teacher-api', audience: 'smart-teacher-playback', subject: 'user-1', expiresIn: 600 },
    );
    await expect(service().verify(token, 'video-a')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects none and HS256 algorithm-confusion tokens', async () => {
    const payload = Buffer.from(JSON.stringify({ vid: 'video-a', pfx: 'videos/video-a/' })).toString('base64url');
    const none = `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')}.${payload}.`;
    const hs256 = await jwt.signAsync(
      { vid: 'video-a', pfx: 'videos/video-a/' },
      { algorithm: 'HS256', secret: 'forged-secret', issuer: 'smart-teacher-api', audience: 'smart-teacher-playback', expiresIn: 600 },
    );
    await expect(service().verify(none, 'video-a')).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service().verify(hs256, 'video-a')).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
