import { InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { generateKeyPairSync } from 'node:crypto';
import { documentPrefix, PlaybackTokenService, videoPrefix } from './playback-token.service';

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

function claimsOf(token: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')) as Record<string, unknown>;
}

describe('PlaybackTokenService', () => {
  it('round-trips and binds both vid and pfx to one video', async () => {
    const tokens = service();
    const { token, expiresInSecs } = await tokens.mint(videoPrefix('video-a'), 'user-1');
    expect(expiresInSecs).toBe(600);
    await expect(tokens.verify(token, videoPrefix('video-a'))).resolves.toBeUndefined();
    await expect(tokens.verify(token, videoPrefix('video-b'))).rejects.toBeInstanceOf(UnauthorizedException);
    expect(tokens.publicJwk()).toMatchObject({ alg: 'ES256', kid: 'test-1', kty: 'EC', use: 'sig' });
  });

  // edge/playback-worker rejects any token whose vid is not a string, so a video token
  // losing this claim would break edge-mode playback without failing any API test.
  it('keeps vid on video tokens and omits it on document tokens', async () => {
    const tokens = service();
    const video = await tokens.mint(videoPrefix('video-a'), 'user-1');
    expect(claimsOf(video.token)).toMatchObject({ vid: 'video-a', typ: 'video', pfx: 'videos/video-a/' });
    const document = await tokens.mint(documentPrefix('doc-a'), 'user-1');
    const documentClaims = claimsOf(document.token);
    expect(documentClaims).toMatchObject({ typ: 'document', pfx: 'documents/doc-a/' });
    expect(documentClaims).not.toHaveProperty('vid');
  });

  it('round-trips a document token and rejects it against another document', async () => {
    const tokens = service();
    const { token } = await tokens.mint(documentPrefix('doc-a'), 'user-1');
    await expect(tokens.verify(token, documentPrefix('doc-a'))).resolves.toBeUndefined();
    await expect(tokens.verify(token, documentPrefix('doc-b'))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('does not let a document token reach a same-named video, or the reverse', async () => {
    const tokens = service();
    const document = await tokens.mint(documentPrefix('shared-id'), 'user-1');
    const video = await tokens.mint(videoPrefix('shared-id'), 'user-1');
    await expect(tokens.verify(document.token, videoPrefix('shared-id'))).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(tokens.verify(video.token, documentPrefix('shared-id'))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a tampered payload and an expired token', async () => {
    const tokens = service();
    const { token } = await tokens.mint(videoPrefix('video-a'), 'user-1');
    const parts = token.split('.');
    const payload = Buffer.from(JSON.stringify({ vid: 'video-a', typ: 'video', pfx: 'videos/video-b/' })).toString('base64url');
    await expect(tokens.verify(`${parts[0]}.${payload}.${parts[2]}`, videoPrefix('video-a'))).rejects.toBeInstanceOf(UnauthorizedException);
    const expired = await service(-1).mint(videoPrefix('video-a'), 'user-1');
    await expect(tokens.verify(expired.token, videoPrefix('video-a'))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a correctly signed token whose pfx disagrees with vid', async () => {
    const token = await jwt.signAsync(
      { vid: 'video-a', typ: 'video', pfx: 'videos/video-b/' },
      { algorithm: 'ES256', privateKey, issuer: 'smart-teacher-api', audience: 'smart-teacher-playback', subject: 'user-1', expiresIn: 600 },
    );
    await expect(service().verify(token, videoPrefix('video-a'))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a correctly signed token whose typ disagrees with its pfx', async () => {
    const token = await jwt.signAsync(
      { vid: 'video-a', typ: 'document', pfx: 'videos/video-a/' },
      { algorithm: 'ES256', privateKey, issuer: 'smart-teacher-api', audience: 'smart-teacher-playback', subject: 'user-1', expiresIn: 600 },
    );
    await expect(service().verify(token, videoPrefix('video-a'))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects none and HS256 algorithm-confusion tokens', async () => {
    const payload = Buffer.from(JSON.stringify({ vid: 'video-a', typ: 'video', pfx: 'videos/video-a/' })).toString('base64url');
    const none = `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')}.${payload}.`;
    const hs256 = await jwt.signAsync(
      { vid: 'video-a', typ: 'video', pfx: 'videos/video-a/' },
      { algorithm: 'HS256', secret: 'forged-secret', issuer: 'smart-teacher-api', audience: 'smart-teacher-playback', expiresIn: 600 },
    );
    await expect(service().verify(none, videoPrefix('video-a'))).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service().verify(hs256, videoPrefix('video-a'))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  // A bad prefix is a programming error on our side, so it must surface as a 500 rather
  // than be laundered into "authentication failed".
  it('refuses an unrecognised prefix on both mint and verify', async () => {
    const tokens = service();
    await expect(tokens.mint('posters/video-a/', 'user-1')).rejects.toBeInstanceOf(InternalServerErrorException);
    await expect(tokens.mint('videos/video-a', 'user-1')).rejects.toBeInstanceOf(InternalServerErrorException);
    const { token } = await tokens.mint(videoPrefix('video-a'), 'user-1');
    await expect(tokens.verify(token, 'videos/')).rejects.toBeInstanceOf(InternalServerErrorException);
  });
});
