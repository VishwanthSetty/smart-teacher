import { Injectable, Logger } from '@nestjs/common';
import { MailService, SchoolAdminInvite } from './mail.service';

/**
 * Stub implementation for v1: logs the invite instead of sending an email.
 * F-04 swaps this for a real provider behind the same MailService port.
 */
@Injectable()
export class LogMailService extends MailService {
  private readonly logger = new Logger(LogMailService.name);

  async sendSchoolAdminInvite(invite: SchoolAdminInvite): Promise<void> {
    this.logger.log(
      `School admin invite for ${invite.email} (${invite.schoolName}): token=${invite.inviteToken}`,
    );
  }
}
