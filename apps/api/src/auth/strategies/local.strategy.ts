import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { Strategy } from 'passport-local';
import { AuthService, INVALID_CREDENTIALS_MESSAGE } from '../auth.service';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly authService: AuthService) {
    // passReqToCallback lets us read the optional schoolSlug field from the body,
    // which passport-local does not expose through its username/password contract.
    super({ usernameField: 'email', passReqToCallback: true });
  }

  async validate(req: Request, email: string, password: string) {
    const schoolSlug = typeof req.body?.schoolSlug === 'string' ? req.body.schoolSlug : undefined;
    const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    const user = await this.authService.validateUser(email, password, ip, schoolSlug);
    if (!user) {
      // Identical for unknown-email and wrong-password — never let a caller
      // distinguish which one failed.
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }
    return user;
  }
}
