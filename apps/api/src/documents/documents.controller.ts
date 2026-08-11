import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { DocumentsService } from './documents.service';
import { DocumentDownloadEntity } from './entities/document-download.entity';
import { DocumentEntity } from './entities/document.entity';

@ApiTags('documents')
@ApiBearerAuth()
@Controller('documents')
@Roles(Role.SCHOOL_ADMIN, Role.TEACHER, Role.STUDENT)
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get()
  @ApiResponse({ status: 200, type: [DocumentEntity] })
  findAll(@CurrentUser() actor: AuthenticatedUser): Promise<DocumentEntity[]> {
    return this.documents.findAllVisibleTo(actor);
  }

  @Get(':id')
  @ApiResponse({ status: 200, type: DocumentEntity })
  findOne(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser): Promise<DocumentEntity> {
    return this.documents.findOneVisibleTo(id, actor);
  }

  @Get(':id/download')
  @ApiResponse({ status: 200, type: DocumentDownloadEntity })
  download(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<DocumentDownloadEntity> {
    return this.documents.createDownloadFor(id, actor);
  }
}
