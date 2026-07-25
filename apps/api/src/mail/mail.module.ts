import { Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { LogMailService } from './log-mail.service';

@Module({
  providers: [{ provide: MailService, useClass: LogMailService }],
  exports: [MailService],
})
export class MailModule {}
