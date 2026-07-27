import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { InvitesService } from './invites.service';

@Module({
  imports: [MailModule],
  providers: [InvitesService],
  exports: [InvitesService],
})
export class InvitesModule {}
