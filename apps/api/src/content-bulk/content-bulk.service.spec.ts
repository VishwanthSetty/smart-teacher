import { BadRequestException, ConflictException, Logger, NotFoundException } from '@nestjs/common';
import { DocumentsService } from '../documents/documents.service';
import { VideosService } from '../videos/videos.service';
import { BulkContentKind } from './content-bulk.constants';
import { ContentBulkService } from './content-bulk.service';
import { BulkContentItemDto } from './dto/create-bulk-content.dto';

const video = (overrides: Partial<BulkContentItemDto> = {}): BulkContentItemDto => ({
  kind: BulkContentKind.VIDEO,
  title: 'Lesson',
  contentNodeId: 'node-1',
  contentType: 'video/mp4',
  sizeBytes: 1024,
  ...overrides,
});

const pdf = (overrides: Partial<BulkContentItemDto> = {}): BulkContentItemDto => ({
  kind: BulkContentKind.DOCUMENT,
  title: 'Worksheet',
  contentNodeId: 'node-1',
  contentType: 'application/pdf',
  sizeBytes: 1024,
  ...overrides,
});

describe('ContentBulkService', () => {
  let videos: { create: jest.Mock; markUploaded: jest.Mock };
  let documents: { create: jest.Mock; markUploaded: jest.Mock };
  let service: ContentBulkService;

  beforeEach(() => {
    videos = {
      create: jest.fn().mockResolvedValue({
        video: { id: 'video-1' },
        uploadUrl: 'https://storage.test/video-1',
        expiresInSecs: 900,
      }),
      markUploaded: jest.fn().mockResolvedValue({ status: 'QUEUED' }),
    };
    documents = {
      create: jest.fn().mockResolvedValue({
        document: { id: 'document-1' },
        uploadUrl: 'https://storage.test/document-1',
        expiresInSecs: 900,
      }),
      markUploaded: jest.fn().mockResolvedValue({ status: 'READY' }),
    };
    service = new ContentBulkService(
      videos as unknown as VideosService,
      documents as unknown as DocumentsService,
    );
  });

  describe('create', () => {
    it('routes each item to the service for its kind and reports them in request order', async () => {
      const result = await service.create({ items: [pdf(), video()] });

      expect(result).toEqual({
        createdCount: 2,
        failedCount: 0,
        items: [
          {
            index: 0,
            kind: BulkContentKind.DOCUMENT,
            ok: true,
            id: 'document-1',
            uploadUrl: 'https://storage.test/document-1',
            expiresInSecs: 900,
          },
          {
            index: 1,
            kind: BulkContentKind.VIDEO,
            ok: true,
            id: 'video-1',
            uploadUrl: 'https://storage.test/video-1',
            expiresInSecs: 900,
          },
        ],
      });
    });

    it('keeps the other items when one is refused by the single-item ingest', async () => {
      videos.create.mockRejectedValueOnce(new NotFoundException('Content node not found'));

      const result = await service.create({ items: [video(), pdf()] });

      expect(result.createdCount).toBe(1);
      expect(result.failedCount).toBe(1);
      expect(result.items[0]).toEqual({
        index: 0,
        kind: BulkContentKind.VIDEO,
        ok: false,
        error: 'Content node not found',
      });
      expect(result.items[1].ok).toBe(true);
    });

    it.each([
      ['a video with a PDF type', video({ contentType: 'application/pdf' }), 'Only MP4 and MOV'],
      ['a PDF with a video type', pdf({ contentType: 'video/mp4' }), 'Only PDF'],
      ['a video over 2 GB', video({ sizeBytes: 2 * 1024 ** 3 + 1 }), '2 GB'],
      ['a PDF over 50 MB', pdf({ sizeBytes: 50 * 1024 ** 2 + 1 }), '50 MB'],
    ])('refuses %s without creating a record', async (_name, item, message) => {
      const result = await service.create({ items: [item] });

      expect(result.items[0].ok).toBe(false);
      expect(result.items[0].error).toContain(message);
      expect(videos.create).not.toHaveBeenCalled();
      expect(documents.create).not.toHaveBeenCalled();
    });

    it('hides an unexpected error behind a generic message', async () => {
      const logged = jest.spyOn(Logger.prototype, 'error').mockImplementation();
      videos.create.mockRejectedValueOnce(new Error('connect ECONNREFUSED 10.0.0.5:5432'));

      const result = await service.create({ items: [video()] });

      expect(result.items[0].error).not.toContain('ECONNREFUSED');
      expect(logged).toHaveBeenCalled();
      logged.mockRestore();
    });
  });

  describe('confirm', () => {
    it('confirms each item through the service for its kind', async () => {
      const result = await service.confirm({
        items: [
          { kind: BulkContentKind.VIDEO, id: 'video-1' },
          { kind: BulkContentKind.DOCUMENT, id: 'document-1' },
        ],
      });

      expect(videos.markUploaded).toHaveBeenCalledWith('video-1');
      expect(documents.markUploaded).toHaveBeenCalledWith('document-1');
      expect(result).toEqual({
        confirmedCount: 2,
        failedCount: 0,
        items: [
          { index: 0, kind: BulkContentKind.VIDEO, id: 'video-1', ok: true, status: 'QUEUED' },
          { index: 1, kind: BulkContentKind.DOCUMENT, id: 'document-1', ok: true, status: 'READY' },
        ],
      });
    });

    it('reports a failed verification on its own item and still confirms the rest', async () => {
      videos.markUploaded.mockRejectedValueOnce(
        new BadRequestException('No file was uploaded for this video'),
      );
      documents.markUploaded.mockRejectedValueOnce(
        new ConflictException('This document is not awaiting an upload'),
      );

      const result = await service.confirm({
        items: [
          { kind: BulkContentKind.VIDEO, id: 'video-1' },
          { kind: BulkContentKind.DOCUMENT, id: 'document-1' },
          { kind: BulkContentKind.VIDEO, id: 'video-2' },
        ],
      });

      expect(result.confirmedCount).toBe(1);
      expect(result.failedCount).toBe(2);
      expect(result.items.map((item) => item.error)).toEqual([
        'No file was uploaded for this video',
        'This document is not awaiting an upload',
        undefined,
      ]);
    });
  });
});
