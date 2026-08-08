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

export interface SchoolAdminWelcome {
  email: string;
  name: string;
  schoolName: string;
  schoolSlug: string;
}

export interface UserCredentials {
  email: string;
  name: string;
  role: Role;
  schoolName: string;
  schoolSlug: string;
  password: string;
}

/**
 * Mail port. Owned interface wrapping the email provider so vendors never
 * leak into feature services — see SmtpMailService for the F-04 implementation.
 */
export abstract class MailService {
  abstract sendUserInvite(invite: UserInvite): Promise<void>;
  abstract sendPasswordReset(reset: PasswordReset): Promise<void>;
  // Sent instead of sendUserInvite when a school admin is created with a password already
  // set — the account is ACTIVE, so a set-password link would only dead-end at redeem().
  abstract sendSchoolAdminWelcome(welcome: SchoolAdminWelcome): Promise<void>;
  abstract sendCredentials(credentials: UserCredentials): Promise<void>;
}
