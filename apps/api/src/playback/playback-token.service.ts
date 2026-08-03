import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createPrivateKey, createPublicKey, KeyObject } from 'node:crypto';

interface PlaybackClaims {
  sub: string;
  vid: string;
  pfx: string;
  iss: string;
  aud: string;
  iat: number;
  exp: number;
}

const ISSUER = 'smart-teacher-api';
const AUDIENCE = 'smart-teacher-playback';

@Injectable()
export class PlaybackTokenService {
  private readonly privateKey: KeyObject;
  private readonly publicKey: KeyObject;
  private readonly keyId: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {
    try {
      const pem = Buffer.from(
        this.configService.getOrThrow<string>('PLAYBACK_SIGNING_PRIVATE_KEY_B64'),
        'base64',
      ).toString('utf8');
      this.privateKey = createPrivateKey(pem);
      this.publicKey = createPublicKey(this.privateKey);
      this.keyId = this.configService.getOrThrow<string>('PLAYBACK_SIGNING_KEY_ID');
    } catch {
      throw new Error('PLAYBACK_SIGNING_PRIVATE_KEY_B64 must contain a valid PKCS#8 private key');
    }
  }

  async mint(videoId: string, userId: string): Promise<{ token: string; expiresInSecs: number }> {
    const expiresInSecs = this.configService.getOrThrow<number>('PLAYBACK_TOKEN_TTL_SECS');
    const token = await this.jwtService.signAsync(
      { vid: videoId, pfx: `videos/${videoId}/` },
      {
        algorithm: 'ES256',
        keyid: this.keyId,
        privateKey: this.privateKey,
        issuer: ISSUER,
        audience: AUDIENCE,
        subject: userId,
        expiresIn: expiresInSecs,
      },
    );
    return { token, expiresInSecs };
  }

  async verify(token: string, videoId: string): Promise<void> {
    try {
      const claims = await this.jwtService.verifyAsync<PlaybackClaims>(token, {
        publicKey: this.publicKey,
        algorithms: ['ES256'],
        issuer: ISSUER,
        audience: AUDIENCE,
      });
      if (claims.vid !== videoId || claims.pfx !== `videos/${videoId}/`) throw this.reject();
    } catch {
      throw this.reject();
    }
  }

  publicJwk(): JsonWebKey {
    return { ...this.publicKey.export({ format: 'jwk' }), kid: this.keyId, use: 'sig', alg: 'ES256' };
  }

  private reject(): UnauthorizedException {
    return new UnauthorizedException('Playback authentication failed');
  }
}
