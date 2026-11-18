import { BadRequestException, HttpException, Injectable, Logger } from '@nestjs/common';
import {
  isAcceptedDocumentContentType,
  MAX_DOCUMENT_BYTES,
} from '../documents/document-ingest.constants';
import { DocumentsService } from '../documents/documents.service';
import { isAcceptedVideoContentType, MAX_VIDEO_BYTES } from '../videos/video-ingest.constants';
import { VideosService } from '../videos/videos.service';
import { BulkContentKind } from './content-bulk.constants';
import { ConfirmBulkContentDto, ConfirmBulkContentItemDto } from './dto/confirm-bulk-content.dto';
import { BulkContentItemDto, CreateBulkContentDto } from './dto/create-bulk-content.dto';
import {
  BulkContentConfirmItemEntity,
  BulkContentConfirmResultEntity,
  BulkContentCreateItemEntity,
  BulkContentCreateResultEntity,
} from './entities/bulk-content-result.entity';

const UNEXPECTED_ITEM_ERROR = 'Something went wrong with this file. Try it again.';

/**
 * Batch front door to the existing single-item ingest. It owns no ingest rules of its own:
 * each item goes through the same VideosService / DocumentsService call as the one-at-a-time
 * form, so a bulk upload can never file content somewhere the single path would refuse.
 *
 * Partial success is the contract, as with the teacher and student imports: one bad file
 * reports its own failure and never costs the others their upload. Items run sequentially
 * because each create opens an interactive transaction, and a batch running them in parallel
 * could exhaust the connection pool for every other request.
 */
@Injectable()
export class ContentBulkService {
  private readonly logger = new Logger(ContentBulkService.name);

  constructor(
    private readonly videos: VideosService,
    private readonly documents: DocumentsService,
  ) {}

  async create(dto: CreateBulkContentDto): Promise<BulkContentCreateResultEntity> {
    const items: BulkContentCreateItemEntity[] = [];
    for (const [index, item] of dto.items.entries()) {
      items.push(await this.createOne(index, item));
    }
    const createdCount = items.filter((item) => item.ok).length;
    return { createdCount, failedCount: items.length - createdCount, items };
  }

  async confirm(dto: ConfirmBulkContentDto): Promise<BulkContentConfirmResultEntity> {
    const items: BulkContentConfirmItemEntity[] = [];
    for (const [index, item] of dto.items.entries()) {
      items.push(await this.confirmOne(index, item));
    }
    const confirmedCount = items.filter((item) => item.ok).length;
    return { confirmedCount, failedCount: items.length - confirmedCount, items };
  }

  private async createOne(
    index: number,
    item: BulkContentItemDto,
  ): Promise<BulkContentCreateItemEntity> {
    try {
      const ticket = await this.issueTicket(item);
      return { index, kind: item.kind, ok: true, ...ticket };
    } catch (error) {
      return { index, kind: item.kind, ok: false, error: this.describeFailure(error) };
    }
  }

  private async confirmOne(
    index: number,
    item: ConfirmBulkContentItemDto,
  ): Promise<BulkContentConfirmItemEntity> {
    try {
      const { status } =
        item.kind === BulkContentKind.VIDEO
          ? await this.videos.markUploaded(item.id)
          : await this.documents.markUploaded(item.id);
      return { index, kind: item.kind, id: item.id, ok: true, status };
    } catch (error) {
      return {
        index,
        kind: item.kind,
        id: item.id,
        ok: false,
        error: this.describeFailure(error),
      };
    }
  }

  private async issueTicket(
    item: BulkContentItemDto,
  ): Promise<{ id: string; uploadUrl: string; expiresInSecs: number }> {
    const { title, description, contentNodeId, contentType, sizeBytes } = item;

    if (item.kind === BulkContentKind.VIDEO) {
      if (!isAcceptedVideoContentType(contentType)) {
        throw new BadRequestException('Only MP4 and MOV videos can be uploaded');
      }
      if (sizeBytes > MAX_VIDEO_BYTES) {
        throw new BadRequestException('This video is larger than the 2 GB limit');
      }
      const ticket = await this.videos.create({
        title,
        description,
        contentNodeId,
        contentType,
        sizeBytes,
      });
      return {
        id: ticket.video.id,
        uploadUrl: ticket.uploadUrl,
        expiresInSecs: ticket.expiresInSecs,
      };
    }

    if (!isAcceptedDocumentContentType(contentType)) {
      throw new BadRequestException('Only PDF documents can be uploaded');
    }
    if (sizeBytes > MAX_DOCUMENT_BYTES) {
      throw new BadRequestException('This document is larger than the 50 MB limit');
    }
    const ticket = await this.documents.create({
      title,
      description,
      contentNodeId,
      contentType,
      sizeBytes,
    });
    return {
      id: ticket.document.id,
      uploadUrl: ticket.uploadUrl,
      expiresInSecs: ticket.expiresInSecs,
    };
  }

  // HTTP exceptions are written for humans and name a problem the operator can act on. Anything
  // else is logged here and kept out of the response, which must not carry internals.
  private describeFailure(error: unknown): string {
    if (error instanceof HttpException) {
      return error.message;
    }
    this.logger.error(
      'Bulk content item failed unexpectedly',
      error instanceof Error ? error.stack : String(error),
    );
    return UNEXPECTED_ITEM_ERROR;
  }
}
