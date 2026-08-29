import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { InvitesModule } from '../invites/invites.module';
import { SchoolsController } from './schools.controller';
import { SchoolsService } from './schools.service';

@Module({
  imports: [MailModule, InvitesModule],
  controllers: [SchoolsController],
  providers: [SchoolsService],
  exports: [SchoolsService],
})
export class SchoolsModule {}
