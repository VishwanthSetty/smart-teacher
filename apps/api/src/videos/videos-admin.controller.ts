import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { VideosService } from './videos.service';
import { CreateVideoDto } from './dto/create-video.dto';
import { VideoEntity } from './entities/video.entity';

// Library management, SUPER_ADMIN only (F-06: "Upload / manage videos").
//
// No @BypassTenantScope(): Video is in PLATFORM_GLOBAL_MODELS and carries no schoolId,
// so the tenant guard's isTenantScoped check never fires on these queries. That holds
// only while nothing here includes the `entitlements` relation — a nested read of
// SchoolContentEntitlement would need a tenant context this caller does not have.
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/videos')
@Roles(Role.SUPER_ADMIN)
export class VideosAdminController {
  constructor(private readonly videosService: VideosService) {}

  @Get()
  @ApiResponse({ status: 200, type: [VideoEntity] })
  findAll(@CurrentUser() actor: AuthenticatedUser): Promise<VideoEntity[]> {
    return this.videosService.findAllVisibleTo(actor);
  }

  @Post()
  @ApiResponse({ status: 201, type: VideoEntity })
  @ApiResponse({ status: 404, description: 'The referenced grade level or subject does not exist.' })
  create(@Body() dto: CreateVideoDto): Promise<VideoEntity> {
    return this.videosService.create(dto);
  }
}
