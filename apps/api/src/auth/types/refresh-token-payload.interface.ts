import { AuthenticatedUser } from './authenticated-user.interface';

export interface RefreshTokenPayload extends AuthenticatedUser {
  jti: string;
  familyId: string;
}
