import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { VideosService } from './videos.service';
import { CreateVideoDto } from './dto/create-video.dto';
import { ListAdminVideosQueryDto } from './dto/list-admin-videos-query.dto';
import { RequestVideoUploadDto } from './dto/request-video-upload.dto';
import { UpdateVideoDto } from './dto/update-video.dto';
import { AdminVideoDetailEntity } from './entities/admin-video-detail.entity';
import { AdminVideoEntity } from './entities/admin-video.entity';
import { PaginatedAdminVideosEntity } from './entities/paginated-admin-videos.entity';
import { VideoUploadTicketEntity } from './entities/video-upload-ticket.entity';

// Library management and ingest, SUPER_ADMIN only (F-06: "Upload / manage videos").
//
// No @BypassTenantScope(): Video is in PLATFORM_GLOBAL_MODELS and carries no schoolId,
// so the tenant guard's isTenantScoped check never fires on these queries. That holds
// only while nothing here includes the `entitlements` relation — a nested read of
// SchoolContentEntitlement would need a tenant context this caller does not have. The
// ingest routes below were checked against that condition: all of them read and write
// Video by id, selecting scalars only.
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/videos')
@Roles(Role.SUPER_ADMIN)
export class VideosAdminController {
  constructor(private readonly videosService: VideosService) {}

  @Get()
  @ApiResponse({ status: 200, type: PaginatedAdminVideosEntity })
  findAll(@Query() query: ListAdminVideosQueryDto): Promise<PaginatedAdminVideosEntity> {
    return this.videosService.findAllForAdmin(query);
  }

  @Get(':id')
  @ApiResponse({ status: 200, type: AdminVideoDetailEntity })
  findOne(@Param('id') id: string): Promise<AdminVideoDetailEntity> {
    return this.videosService.findOneForAdmin(id);
  }

  @Patch(':id')
  @ApiResponse({ status: 200, type: AdminVideoDetailEntity })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateVideoDto,
  ): Promise<AdminVideoDetailEntity> {
    return this.videosService.update(id, dto);
  }

  @Post()
  @ApiResponse({
    status: 201,
    type: VideoUploadTicketEntity,
    description: 'Video created in UPLOADING, with a short-lived presigned PUT for its source.',
  })
  @ApiResponse({ status: 404, description: 'The referenced grade level or subject does not exist.' })
  @ApiResponse({ status: 409, description: 'The referenced subject is retired.' })
  create(@Body() dto: CreateVideoDto): Promise<VideoUploadTicketEntity> {
    return this.videosService.create(dto);
  }

  // 200, not Nest's default 201: this confirms an existing record rather than creating
  // anything — the same contract as confirming a bulk-import batch.
  @Post(':id/uploaded')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({
    status: 200,
    type: AdminVideoEntity,
    description: 'Source verified; the video moves to QUEUED and a transcode job is enqueued.',
  })
  @ApiResponse({ status: 400, description: 'No file was uploaded, or it failed verification.' })
  @ApiResponse({ status: 409, description: 'This video is not awaiting an upload.' })
  markUploaded(@Param('id') id: string): Promise<AdminVideoEntity> {
    return this.videosService.markUploaded(id);
  }

  @Post(':id/upload-url')
  @ApiResponse({
    status: 201,
    type: VideoUploadTicketEntity,
    description: 'A fresh presigned PUT for retrying an abandoned or failed upload.',
  })
  @ApiResponse({ status: 409, description: 'This video is not awaiting an upload.' })
  createUploadUrl(
    @Param('id') id: string,
    @Body() dto: RequestVideoUploadDto,
  ): Promise<VideoUploadTicketEntity> {
    return this.videosService.createUploadUrl(id, dto);
  }

  // Re-drives a failed transcode from the source already in the bucket, rather than making
  // anyone re-upload it. 200, not 201: nothing new is created.
  @Post(':id/retry')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({
    status: 200,
    type: AdminVideoEntity,
    description: 'The video returns to QUEUED and a fresh transcode job is enqueued.',
  })
  @ApiResponse({
    status: 409,
    description: 'The video is not FAILED, or its source is no longer in the bucket.',
  })
  retry(@Param('id') id: string): Promise<AdminVideoEntity> {
    return this.videosService.retry(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiResponse({ status: 204, description: 'The record, source, and HLS output are removed.' })
  @ApiResponse({ status: 409, description: 'A processing video cannot be deleted yet.' })
  remove(@Param('id') id: string): Promise<void> {
    return this.videosService.remove(id);
  }
}
