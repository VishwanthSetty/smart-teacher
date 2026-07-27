import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { RefreshTokenPayload } from '../types/refresh-token-payload.interface';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      passReqToCallback: true,
      jsonWebTokenOptions: { clockTolerance: 10 },
    });
  }

  validate(req: Request, payload: RefreshTokenPayload): RefreshTokenPayload & { refreshToken: string } {
    const refreshToken = ExtractJwt.fromAuthHeaderAsBearerToken()(req) as string;
    return { ...payload, refreshToken };
  }
}
