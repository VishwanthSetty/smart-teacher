import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthenticatedUser } from '../types/authenticated-user.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      // Tolerates minor clock skew between this server and whatever issued the
      // token (relevant once there's more than one API instance).
      jsonWebTokenOptions: { clockTolerance: 10 },
    });
  }

  // Trusts the signed JWT payload directly (no DB lookup) — access tokens are
  // short-lived (15m), so role/deactivation changes apply within that window.
  validate(payload: AuthenticatedUser): AuthenticatedUser {
    return payload;
  }
}
