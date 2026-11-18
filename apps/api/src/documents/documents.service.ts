import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DocumentStatus, Prisma } from '@prisma/client';
import { actorScopeOf, requireReadable } from '../common/authorization/resource-access';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { ActorContentScopeService } from '../entitlements/actor-content-scope.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { ContentNodeUsabilityService } from '../curriculum/content-node-usability.service';
import { DocumentsAccessPolicy } from './documents-access.policy';
import { CreateDocumentDto } from './dto/create-document.dto';
import { ListAdminDocumentsQueryDto } from './dto/list-admin-documents-query.dto';
import { RequestDocumentUploadDto } from './dto/request-document-upload.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { AdminDocumentDetailEntity } from './entities/admin-document-detail.entity';
import { AdminDocumentEntity } from './entities/admin-document.entity';
import { DocumentDownloadEntity } from './entities/document-download.entity';
import { DocumentEntity } from './entities/document.entity';
import { DocumentUploadTicketEntity } from './entities/document-upload-ticket.entity';
import { PaginatedAdminDocumentsEntity } from './entities/paginated-admin-documents.entity';
import { isAcceptedDocumentContentType, MAX_DOCUMENT_BYTES } from './document-ingest.constants';

const DOCUMENT_SELECT = {
  id: true,
  title: true,
  description: true,
  pageCount: true,
  contentNodeId: true,
  node: {
    select: {
      title: true,
      curriculumId: true,
      curriculum: { select: { gradeLevelId: true, subjectId: true } },
    },
  },
} as const satisfies Prisma.DocumentSelect;

const ADMIN_DOCUMENT_SELECT = {
  ...DOCUMENT_SELECT,
  status: true,
  sizeBytes: true,
  contentType: true,
  failureReason: true,
  createdAt: true,
} as const satisfies Prisma.DocumentSelect;

type DocumentRow = Prisma.DocumentGetPayload<{ select: typeof DOCUMENT_SELECT }>;
type AdminDocumentRow = Prisma.DocumentGetPayload<{ select: typeof ADMIN_DOCUMENT_SELECT }>;

function toDocumentEntity(row: DocumentRow): DocumentEntity {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    contentNodeId: row.contentNodeId,
    contentNodeTitle: row.node.title,
    curriculumId: row.node.curriculumId,
    gradeLevelId: row.node.curriculum.gradeLevelId,
    subjectId: row.node.curriculum.subjectId,
    pageCount: row.pageCount,
  };
}

function toAdminDocumentEntity(row: AdminDocumentRow): AdminDocumentEntity {
  return {
    ...toDocumentEntity(row),
    status: row.status,
    sizeBytes: row.sizeBytes,
    contentType: row.contentType,
    failureReason: row.failureReason,
    createdAt: row.createdAt,
  };
}

/**
 * PDF ingest is intentionally smaller than video ingest: documents have no external id,
 * renditions, fencing token, queue, reconciler, worker callback, HLS proxy, playback JWT,
 * retry job, or retain-source flag. The uploaded source is the delivered artefact.
 */
@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly contentScope: ActorContentScopeService,
    private readonly accessPolicy: DocumentsAccessPolicy,
    private readonly storage: StorageService,
    private readonly nodeUsability: ContentNodeUsabilityService,
  ) {}

  countAll(): Promise<number> {
    return this.prisma.document.count();
  }

  async findAllVisibleTo(actor: AuthenticatedUser): Promise<DocumentEntity[]> {
    const scope = await this.contentScope.resolveBrowse(actorScopeOf(actor));
    const rows = await this.prisma.document.findMany({
      where: {
        status: DocumentStatus.READY,
        ...(scope === 'all' ? {} : { node: { curriculumId: { in: scope } } }),
      },
      select: DOCUMENT_SELECT,
      orderBy: { title: 'asc' },
    });
    return rows.map(toDocumentEntity);
  }

  async findOneVisibleTo(id: string, actor: AuthenticatedUser): Promise<DocumentEntity> {
    const row = await this.prisma.document.findFirst({
      where: { id, status: DocumentStatus.READY },
      select: DOCUMENT_SELECT,
    });
    return requireReadable<DocumentEntity>(
      row === null ? null : toDocumentEntity(row),
      actorScopeOf(actor),
      this.accessPolicy,
      'Document not found',
    );
  }

  async createDownloadFor(id: string, actor: AuthenticatedUser): Promise<DocumentDownloadEntity> {
    const row = await this.prisma.document.findFirst({
      where: { id, status: DocumentStatus.READY },
      select: { title: true, sourceKey: true, node: { select: { curriculumId: true } } },
    });
    const readable = await requireReadable<{
      title: string;
      sourceKey: string | null;
      curriculumId: string;
      node: { curriculumId: string };
    }>(
      row === null ? null : { ...row, curriculumId: row.node.curriculumId },
      actorScopeOf(actor),
      this.accessPolicy,
      'Document not found',
    );
    if (readable.sourceKey === null) throw new NotFoundException('Document not found');
    const download = await this.storage.createPresignedDownload(readable.sourceKey);
    return {
      url: download.url,
      expiresInSecs: download.expiresInSecs,
      fileName: `${safeFileName(readable.title)}.pdf`,
    };
  }

  async findAllForAdmin(query: ListAdminDocumentsQueryDto): Promise<PaginatedAdminDocumentsEntity> {
    const where: Prisma.DocumentWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.contentNodeId ? { contentNodeId: query.contentNodeId } : {}),
      ...(query.search ? { title: { contains: query.search, mode: 'insensitive' } } : {}),
      ...((query.gradeLevelId || query.subjectId || query.curriculumId) ? {
        node: { curriculum: {
          ...(query.gradeLevelId ? { gradeLevelId: query.gradeLevelId } : {}),
          ...(query.subjectId ? { subjectId: query.subjectId } : {}),
          ...(query.curriculumId ? { id: query.curriculumId } : {}),
        } },
      } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.document.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: ADMIN_DOCUMENT_SELECT,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.document.count({ where }),
    ]);
    return {
      data: rows.map(toAdminDocumentEntity),
      meta: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) },
    };
  }

  async findOneForAdmin(id: string): Promise<AdminDocumentDetailEntity> {
    const row = await this.prisma.document.findUnique({
      where: { id },
      select: { ...ADMIN_DOCUMENT_SELECT, sourceKey: true, updatedAt: true },
    });
    if (row === null) throw new NotFoundException('Document not found');
    return { ...toAdminDocumentEntity(row), sourceKey: row.sourceKey, updatedAt: row.updatedAt };
  }

  async createDownloadForAdmin(id: string): Promise<DocumentDownloadEntity> {
    const row = await this.prisma.document.findFirst({
      where: { id, status: DocumentStatus.READY },
      select: { title: true, sourceKey: true },
    });
    if (row?.sourceKey === null || row?.sourceKey === undefined) {
      throw new NotFoundException('Document not found');
    }
    const download = await this.storage.createPresignedDownload(row.sourceKey);
    return {
      url: download.url,
      expiresInSecs: download.expiresInSecs,
      fileName: `${safeFileName(row.title)}.pdf`,
    };
  }

  async create(dto: CreateDocumentDto): Promise<DocumentUploadTicketEntity> {
    await this.nodeUsability.assertNodeUsable(dto.contentNodeId, 'Documents');
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.document.create({
        data: {
          title: dto.title,
          description: dto.description,
          contentNodeId: dto.contentNodeId,
          status: DocumentStatus.UPLOADING,
        },
        select: { id: true },
      });
      return tx.document.update({
        where: { id: created.id },
        data: { sourceKey: sourceKeyFor(created.id) },
        select: ADMIN_DOCUMENT_SELECT,
      });
    });
    return this.issueUploadTicket(toAdminDocumentEntity(row), sourceKeyFor(row.id), dto.contentType);
  }

  async update(id: string, dto: UpdateDocumentDto): Promise<AdminDocumentDetailEntity> {
    const existing = await this.prisma.document.findUnique({ where: { id }, select: { id: true } });
    if (existing === null) throw new NotFoundException('Document not found');
    if (dto.contentNodeId) await this.nodeUsability.assertNodeUsable(dto.contentNodeId, 'Documents');
    await this.prisma.document.update({
      where: { id },
      data: { title: dto.title, description: dto.description, contentNodeId: dto.contentNodeId },
    });
    return this.findOneForAdmin(id);
  }

  async markUploaded(id: string): Promise<AdminDocumentEntity> {
    const row = await this.prisma.document.findUnique({
      where: { id },
      select: { id: true, status: true, sourceKey: true },
    });
    if (row === null) throw new NotFoundException('Document not found');
    if (row.status !== DocumentStatus.UPLOADING) {
      throw new ConflictException('This document is not awaiting an upload');
    }
    if (row.sourceKey === null) throw new ConflictException('This document has no upload destination');
    const stored = await this.storage.statObject(row.sourceKey);
    if (stored === null) throw await this.failUpload(id, 'No file was uploaded for this document');
    if (stored.sizeBytes === 0) throw await this.failUpload(id, 'The uploaded file is empty');
    if (stored.sizeBytes > MAX_DOCUMENT_BYTES) {
      throw await this.failUpload(id, 'The uploaded file is larger than the 50 MB limit');
    }
    if (!isAcceptedDocumentContentType(stored.contentType)) {
      throw await this.failUpload(id, 'The uploaded file is not a PDF document');
    }
    const updated = await this.prisma.document.update({
      where: { id },
      data: {
        status: DocumentStatus.READY,
        sizeBytes: stored.sizeBytes,
        contentType: stored.contentType,
        failureReason: null,
      },
      select: ADMIN_DOCUMENT_SELECT,
    });
    return toAdminDocumentEntity(updated);
  }

  async createUploadUrl(
    id: string,
    dto: RequestDocumentUploadDto,
  ): Promise<DocumentUploadTicketEntity> {
    const row = await this.prisma.document.findUnique({
      where: { id },
      select: { ...ADMIN_DOCUMENT_SELECT, sourceKey: true },
    });
    if (row === null) throw new NotFoundException('Document not found');
    if (row.status === DocumentStatus.READY) {
      throw new ConflictException('A ready document cannot be replaced');
    }
    if (row.sourceKey === null) throw new ConflictException('This document has no upload destination');
    const reset = await this.prisma.document.update({
      where: { id },
      data: {
        status: DocumentStatus.UPLOADING,
        sizeBytes: null,
        contentType: null,
        failureReason: null,
      },
      select: ADMIN_DOCUMENT_SELECT,
    });
    return this.issueUploadTicket(toAdminDocumentEntity(reset), row.sourceKey, dto.contentType);
  }

  async remove(id: string): Promise<void> {
    const row = await this.prisma.document.findUnique({ where: { id }, select: { id: true } });
    if (row === null) throw new NotFoundException('Document not found');
    await this.prisma.document.delete({ where: { id } });
    try {
      await this.storage.deletePrefix(`documents/${id}/`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Deleted document ${id} but left its source behind: ${reason}`);
    }
  }

  private async issueUploadTicket(
    document: AdminDocumentEntity,
    sourceKey: string,
    contentType: string,
  ): Promise<DocumentUploadTicketEntity> {
    const upload = await this.storage.createPresignedUpload(sourceKey, contentType);
    return { document, uploadUrl: upload.url, expiresInSecs: upload.expiresInSecs };
  }

  private async failUpload(id: string, message: string): Promise<BadRequestException> {
    await this.prisma.document.update({
      where: { id },
      data: { status: DocumentStatus.FAILED, failureReason: message },
    });
    return new BadRequestException(message);
  }
}

function sourceKeyFor(documentId: string): string {
  return `documents/${documentId}/source.pdf`;
}

function safeFileName(title: string): string {
  return title.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'document';
}
