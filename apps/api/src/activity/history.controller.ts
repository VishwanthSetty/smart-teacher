import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ActivityQueryDto } from './dto/activity-query.dto';
import { HistoryService } from './history.service';

@ApiTags('activity')
@ApiBearerAuth()
@Roles(Role.SCHOOL_ADMIN, Role.TEACHER, Role.STUDENT)
@Controller('me')
export class HistoryController {
  constructor(private readonly historyService: HistoryService) {}

  @Get('activity')
  @ApiOkResponse({ description: 'Returns visible activity newest first.' })
  history(@Query() query: ActivityQueryDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.historyService.history(actor, query);
  }

  @Get('continue')
  @ApiOkResponse({ description: 'Returns up to ten in-progress resources.' })
  continueLearning(@CurrentUser() actor: AuthenticatedUser) {
    return this.historyService.continueLearning(actor);
  }
}
