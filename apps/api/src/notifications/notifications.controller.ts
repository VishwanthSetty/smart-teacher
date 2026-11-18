import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ListNotificationsQueryDto, RegisterDeviceDto, UpdateNotificationPreferenceDto } from './dto/notification.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth()
@Roles(Role.TEACHER, Role.STUDENT)
@Controller('me')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get('notifications')
  @ApiOkResponse({ description: 'The current user notification feed.' })
  list(@Query() query: ListNotificationsQueryDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.notifications.list(actor, query);
  }

  @Post('notifications/read-all')
  @ApiOkResponse({ description: 'Marks every notification as read.' })
  readAll(@CurrentUser() actor: AuthenticatedUser) {
    return this.notifications.markAllRead(actor);
  }

  @Post('notifications/:id/read')
  @ApiOkResponse({ description: 'Marks one owned notification as read.' })
  read(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.notifications.markRead(id, actor);
  }

  @Get('notification-preferences')
  @ApiOkResponse({ description: 'Returns effective notification preferences.' })
  preference(@CurrentUser() actor: AuthenticatedUser) {
    return this.notifications.getPreference(actor);
  }

  @Patch('notification-preferences')
  @ApiOkResponse({ description: 'Updates notification preferences.' })
  updatePreference(
    @Body() dto: UpdateNotificationPreferenceDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.notifications.updatePreference(dto, actor);
  }

  @Post('devices')
  @ApiOkResponse({ description: 'Registers or refreshes a push device.' })
  registerDevice(@Body() dto: RegisterDeviceDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.notifications.registerDevice(dto, actor);
  }

  @Delete('devices/:id')
  @ApiOkResponse({ description: 'Removes an owned push device.' })
  removeDevice(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser): Promise<void> {
    return this.notifications.removeDevice(id, actor);
  }
}
