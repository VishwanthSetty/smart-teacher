export interface SchoolAdminInvite {
  email: string;
  name: string;
  schoolName: string;
  schoolSlug: string;
  inviteToken: string;
}

/**
 * Mail port. Owned interface wrapping the (future) email provider so vendors never
 * leak into feature services. F-04 replaces the implementation without touching callers.
 */
export abstract class MailService {
  abstract sendSchoolAdminInvite(invite: SchoolAdminInvite): Promise<void>;
}
