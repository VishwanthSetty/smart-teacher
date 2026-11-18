import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UpdateDocumentProgressDto } from './dto/update-document-progress.dto';
import { UpdateVideoProgressDto } from './dto/update-video-progress.dto';
import { ProgressService } from './progress.service';

@ApiTags('activity')
@ApiBearerAuth()
@Roles(Role.SCHOOL_ADMIN, Role.TEACHER, Role.STUDENT)
@Controller('me/progress')
export class ProgressController {
  constructor(private readonly progress: ProgressService) {}

  @Put('videos/:id')
  @ApiOkResponse({ description: 'Merges a playback heartbeat into video progress.' })
  updateVideo(
    @Param('id') id: string,
    @Body() dto: UpdateVideoProgressDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.progress.updateVideo(id, dto, actor);
  }

  @Put('documents/:id')
  @ApiOkResponse({ description: 'Updates document reading position without completing it.' })
  updateDocument(
    @Param('id') id: string,
    @Body() dto: UpdateDocumentProgressDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.progress.updateDocument(id, dto, actor);
  }

  @Post('documents/:id/complete')
  @ApiOkResponse({ description: 'Marks a document complete.' })
  markDocumentComplete(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.progress.markDocumentComplete(id, actor);
  }

  @Delete('documents/:id/complete')
  @ApiOkResponse({ description: 'Removes learner-asserted document completion.' })
  unmarkDocumentComplete(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.progress.unmarkDocumentComplete(id, actor);
  }

  @Get('summary')
  @ApiOkResponse({ description: 'Returns per-subject progress over the visible library.' })
  summary(@CurrentUser() actor: AuthenticatedUser) {
    return this.progress.summary(actor);
  }
}
