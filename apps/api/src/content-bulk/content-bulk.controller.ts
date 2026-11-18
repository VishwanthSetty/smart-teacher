import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { ContentBulkService } from './content-bulk.service';
import { ConfirmBulkContentDto } from './dto/confirm-bulk-content.dto';
import { CreateBulkContentDto } from './dto/create-bulk-content.dto';
import {
  BulkContentConfirmResultEntity,
  BulkContentCreateResultEntity,
} from './entities/bulk-content-result.entity';

// No @BypassTenantScope(), for the reason given on VideosAdminController: Video and Document
// are platform-global and these routes reach only their by-id reads and writes.
//
// Both routes answer 200 even if every item failed. The outcome is per item, so the status
// code only says the batch itself was well formed.
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/content/bulk')
@Roles(Role.SUPER_ADMIN)
export class ContentBulkController {
  constructor(private readonly contentBulk: ContentBulkService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiResponse({
    status: 200,
    type: BulkContentCreateResultEntity,
    description: 'Creates each item in UPLOADING and returns its presigned PUT, or its own error.',
  })
  @ApiResponse({ status: 400, description: 'The batch is empty, too large, or malformed.' })
  create(@Body() dto: CreateBulkContentDto): Promise<BulkContentCreateResultEntity> {
    return this.contentBulk.create(dto);
  }

  @Post('confirm')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({
    status: 200,
    type: BulkContentConfirmResultEntity,
    description: 'Verifies each stored file. Videos move to QUEUED and documents to READY.',
  })
  @ApiResponse({ status: 400, description: 'The batch is empty, too large, or malformed.' })
  confirm(@Body() dto: ConfirmBulkContentDto): Promise<BulkContentConfirmResultEntity> {
    return this.contentBulk.confirm(dto);
  }
}
