import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { PlaybackTokenEntity } from './entities/playback-token.entity';
import { PlaybackService } from './playback.service';

// SUPER_ADMIN reaches only platform-global Video/VideoRendition here; its content scope
// short-circuits to all before any tenant-scoped entitlement query is made.
@ApiTags('playback')
@ApiBearerAuth()
@Controller('videos')
export class PlaybackController {
  constructor(private readonly playback: PlaybackService) {}

  @Get(':id/playback-token')
  @Roles(Role.SUPER_ADMIN, Role.TEACHER, Role.STUDENT)
  @ApiResponse({ status: 200, type: PlaybackTokenEntity })
  create(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<PlaybackTokenEntity> {
    return this.playback.createToken(id, actor);
  }
}
