import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { Strategy } from 'passport-local';
import { AuthService } from '../auth.service';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly authService: AuthService) {
    // passReqToCallback lets us read the optional schoolSlug field from the body,
    // which passport-local does not expose through its username/password contract.
    super({ usernameField: 'email', passReqToCallback: true });
  }

  async validate(req: Request, email: string, password: string) {
    const schoolSlug = typeof req.body?.schoolSlug === 'string' ? req.body.schoolSlug : undefined;
    const user = await this.authService.validateUser(email, password, schoolSlug);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return user;
  }
}
