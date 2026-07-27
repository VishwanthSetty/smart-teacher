import { Role } from '@prisma/client';

export interface UserInvite {
  email: string;
  name: string;
  role: Role;
  schoolName: string;
  schoolSlug: string;
  inviteToken: string;
}

export interface PasswordReset {
  email: string;
  name: string;
  schoolName: string | null;
  resetToken: string;
}

/**
 * Mail port. Owned interface wrapping the email provider so vendors never
 * leak into feature services — see SmtpMailService for the F-04 implementation.
 */
export abstract class MailService {
  abstract sendUserInvite(invite: UserInvite): Promise<void>;
  abstract sendPasswordReset(reset: PasswordReset): Promise<void>;
}
