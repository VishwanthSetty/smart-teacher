import { Injectable, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createPrivateKey, createPublicKey, JsonWebKey, KeyObject } from 'node:crypto';

export type MediaTokenType = 'video' | 'document';

interface PlaybackClaims {
  sub: string;
  // Only video tokens carry `vid` — see the note in mint().
  vid?: string;
  typ: MediaTokenType;
  pfx: string;
  iss: string;
  aud: string;
  iat: number;
  exp: number;
}

const ISSUER = 'smart-teacher-api';
const AUDIENCE = 'smart-teacher-playback';

// The only two storage prefixes a media token may be scoped to. The leading segment also
// decides the `typ` claim, so a token's prefix and its type can never disagree.
const PREFIX_PATTERN = /^(videos|documents)\/([^/]+)\/$/;

export function videoPrefix(videoId: string): string {
  return `videos/${videoId}/`;
}

export function documentPrefix(documentId: string): string {
  return `documents/${documentId}/`;
}

@Injectable()
export class PlaybackTokenService {
  private readonly privateKey: KeyObject;
  private readonly publicKey: KeyObject;
  private readonly publicPem: Buffer;
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
      this.publicPem = Buffer.from(this.publicKey.export({ format: 'pem', type: 'spki' }));
      this.keyId = this.configService.getOrThrow<string>('PLAYBACK_SIGNING_KEY_ID');
    } catch {
      throw new Error('PLAYBACK_SIGNING_PRIVATE_KEY_B64 must contain a valid PKCS#8 private key');
    }
  }

  /** Mints a token authorising exactly one storage prefix — build it with videoPrefix/documentPrefix. */
  async mint(prefix: string, userId: string): Promise<{ token: string; expiresInSecs: number }> {
    const scope = parsePrefix(prefix);
    const expiresInSecs = this.configService.getOrThrow<number>('PLAYBACK_TOKEN_TTL_SECS');
    const token = await this.jwtService.signAsync(
      {
        // `vid` is kept on video tokens because edge/playback-worker rejects any token
        // whose `vid` is not a string (edge/playback-worker/src/jwt.ts) — dropping it
        // would fail every edge-mode playback. Document tokens omit it and never reach
        // the worker, whose path mapping only resolves `videos/...` keys.
        ...(scope.type === 'video' ? { vid: scope.id } : {}),
        typ: scope.type,
        pfx: prefix,
      },
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

  async verify(token: string, expectedPrefix: string): Promise<void> {
    // Outside the try on purpose: a malformed expected prefix is our bug, not the
    // caller's, and must not be masked as an authentication failure.
    const scope = parsePrefix(expectedPrefix);
    try {
      const claims = await this.jwtService.verifyAsync<PlaybackClaims>(token, {
        publicKey: this.publicPem,
        algorithms: ['ES256'],
        issuer: ISSUER,
        audience: AUDIENCE,
      });
      if (claims.pfx !== expectedPrefix || claims.typ !== scope.type) throw this.reject();
      // `pfx` alone already fixes the scope; cross-checking `vid` keeps a video token
      // whose two scope claims disagree rejected, exactly as before generalization.
      if (scope.type === 'video' && claims.vid !== scope.id) throw this.reject();
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

function parsePrefix(prefix: string): { type: MediaTokenType; id: string } {
  const match = PREFIX_PATTERN.exec(prefix);
  if (match === null) throw new InternalServerErrorException('Media token scope is invalid');
  return { type: match[1] === 'videos' ? 'video' : 'document', id: match[2] };
}
