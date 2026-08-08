import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { VideosService } from './videos.service';
import { VideoEntity } from './entities/video.entity';

// The school-facing library. Browsing and watching entitled content is available to
// SCHOOL_ADMIN, TEACHER and STUDENT. SUPER_ADMIN remains excluded because platform
// authors manage the library through /admin/videos instead.
//
// No @BypassTenantScope(): both roles carry a real schoolId, and the tenant guard
// scoping SchoolContentEntitlement to it is exactly what makes the read safe.
@ApiTags('videos')
@ApiBearerAuth()
@Controller('videos')
@Roles(Role.SCHOOL_ADMIN, Role.TEACHER, Role.STUDENT)
export class VideosController {
  constructor(private readonly videosService: VideosService) {}

  @Get()
  @ApiResponse({ status: 200, type: [VideoEntity] })
  findAll(@CurrentUser() actor: AuthenticatedUser): Promise<VideoEntity[]> {
    return this.videosService.findAllVisibleTo(actor);
  }

  @Get(':id')
  @ApiResponse({ status: 200, type: VideoEntity })
  @ApiResponse({ status: 404, description: 'No such video, or the school holds no entitlement for it.' })
  findOne(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser): Promise<VideoEntity> {
    return this.videosService.findOneVisibleTo(id, actor);
  }
}
