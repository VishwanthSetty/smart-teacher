import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { InvitesModule } from '../invites/invites.module';
import { UsersController } from './users.controller';
import { AdminUsersController } from './admin-users.controller';
import { UsersService } from './users.service';
import { UsersAccessPolicy } from './users-access.policy';

@Module({
  imports: [MailModule, InvitesModule],
  controllers: [UsersController, AdminUsersController],
  providers: [UsersService, UsersAccessPolicy],
  exports: [UsersService],
})
export class UsersModule {}
