import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { DocumentsService } from './documents.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { ListAdminDocumentsQueryDto } from './dto/list-admin-documents-query.dto';
import { RequestDocumentUploadDto } from './dto/request-document-upload.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { AdminDocumentDetailEntity } from './entities/admin-document-detail.entity';
import { AdminDocumentEntity } from './entities/admin-document.entity';
import { DocumentUploadTicketEntity } from './entities/document-upload-ticket.entity';
import { PaginatedAdminDocumentsEntity } from './entities/paginated-admin-documents.entity';

// Safe without @BypassTenantScope only while these platform-global reads never include
// Curriculum.entitlements or another tenant-scoped relation.
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/documents')
@Roles(Role.SUPER_ADMIN)
export class DocumentsAdminController {
  constructor(private readonly documents: DocumentsService) {}

  @Get()
  @ApiResponse({ status: 200, type: PaginatedAdminDocumentsEntity })
  findAll(@Query() query: ListAdminDocumentsQueryDto): Promise<PaginatedAdminDocumentsEntity> {
    return this.documents.findAllForAdmin(query);
  }

  @Get(':id')
  @ApiResponse({ status: 200, type: AdminDocumentDetailEntity })
  findOne(@Param('id') id: string): Promise<AdminDocumentDetailEntity> {
    return this.documents.findOneForAdmin(id);
  }

  @Post()
  @ApiResponse({ status: 201, type: DocumentUploadTicketEntity })
  create(@Body() dto: CreateDocumentDto): Promise<DocumentUploadTicketEntity> {
    return this.documents.create(dto);
  }

  @Patch(':id')
  @ApiResponse({ status: 200, type: AdminDocumentDetailEntity })
  update(@Param('id') id: string, @Body() dto: UpdateDocumentDto): Promise<AdminDocumentDetailEntity> {
    return this.documents.update(id, dto);
  }

  @Post(':id/uploaded')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200, type: AdminDocumentEntity })
  markUploaded(@Param('id') id: string): Promise<AdminDocumentEntity> {
    return this.documents.markUploaded(id);
  }

  @Post(':id/upload-url')
  @ApiResponse({ status: 201, type: DocumentUploadTicketEntity })
  createUploadUrl(
    @Param('id') id: string,
    @Body() dto: RequestDocumentUploadDto,
  ): Promise<DocumentUploadTicketEntity> {
    return this.documents.createUploadUrl(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiResponse({ status: 204 })
  remove(@Param('id') id: string): Promise<void> {
    return this.documents.remove(id);
  }
}
