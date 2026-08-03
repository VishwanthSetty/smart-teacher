import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { SubjectStatus, VideoStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ActorContentScopeService } from '../entitlements/actor-content-scope.service';
import { StorageService } from '../storage/storage.service';
import { TranscodeQueue } from '../transcoding/transcode-queue';
import { VideosAccessPolicy } from './videos-access.policy';
import { VideosService } from './videos.service';
import { TranscodeReconcilerService } from './transcode-reconciler.service';
import { MAX_VIDEO_BYTES } from './video-ingest.constants';

const VIDEO_ID = 'video-1';
const SOURCE_KEY = `${VIDEO_ID}/source.mp4`;

describe('VideosService', () => {
  let service: VideosService;
  let prisma: {
    video: {
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    videoRendition: { deleteMany: jest.Mock };
    gradeLevel: { count: jest.Mock };
    subject: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let storage: {
    createPresignedUpload: jest.Mock;
    statObject: jest.Mock;
    deleteObject: jest.Mock;
    deletePrefix: jest.Mock;
  };
  let transcodeQueue: { enqueue: jest.Mock };
  let reconciler: { sweepStale: jest.Mock };

  beforeEach(async () => {
    prisma = {
      video: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({ id: VIDEO_ID }),
        update: jest.fn().mockResolvedValue({ id: VIDEO_ID, status: VideoStatus.UPLOADING }),
        delete: jest.fn().mockResolvedValue({ id: VIDEO_ID }),
      },
      videoRendition: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      gradeLevel: { count: jest.fn().mockResolvedValue(1) },
      subject: { findUnique: jest.fn().mockResolvedValue({ status: SubjectStatus.ACTIVE }) },
      // Handles both call shapes the service uses: the array form for the taxonomy
      // pre-checks and the callback form for the create-then-key write.
      $transaction: jest.fn((arg: unknown) =>
        typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(prisma) : Promise.all(arg as unknown[]),
      ),
    };
    storage = {
      createPresignedUpload: jest
        .fn()
        .mockResolvedValue({ url: 'https://storage.test/put', key: SOURCE_KEY, expiresInSecs: 900 }),
      statObject: jest.fn(),
      deleteObject: jest.fn().mockResolvedValue(undefined),
      deletePrefix: jest.fn().mockResolvedValue(undefined),
    };
    transcodeQueue = { enqueue: jest.fn().mockResolvedValue(undefined) };
    reconciler = { sweepStale: jest.fn().mockResolvedValue(0) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VideosService,
        { provide: PrismaService, useValue: prisma },
        { provide: ActorContentScopeService, useValue: { resolve: jest.fn(), includes: jest.fn() } },
        { provide: VideosAccessPolicy, useValue: { canRead: jest.fn() } },
        { provide: StorageService, useValue: storage },
        { provide: TranscodeQueue, useValue: transcodeQueue },
        { provide: TranscodeReconcilerService, useValue: reconciler },
      ],
    }).compile();

    service = module.get(VideosService);
  });

  const createDto = {
    title: 'Fractions',
    gradeLevelId: 'grade-1',
    subjectId: 'subject-1',
    contentType: 'video/mp4' as const,
    sizeBytes: 1024,
  };

  describe('create', () => {
    it('presigns the key derived from the created row, not one the caller chose', async () => {
      prisma.video.update.mockResolvedValue({ id: VIDEO_ID, status: VideoStatus.UPLOADING });

      const ticket = await service.create(createDto);

      expect(prisma.video.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: VideoStatus.UPLOADING }) }),
      );
      expect(storage.createPresignedUpload).toHaveBeenCalledWith(SOURCE_KEY, 'video/mp4');
      expect(ticket.uploadUrl).toBe('https://storage.test/put');
    });

    it('404s on an unknown grade level before creating anything', async () => {
      prisma.gradeLevel.count.mockResolvedValue(0);

      await expect(service.create(createDto)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.video.create).not.toHaveBeenCalled();
      expect(storage.createPresignedUpload).not.toHaveBeenCalled();
    });

    it('409s on a retired subject rather than admitting new content to it', async () => {
      prisma.subject.findUnique.mockResolvedValue({ status: SubjectStatus.RETIRED });

      await expect(service.create(createDto)).rejects.toBeInstanceOf(ConflictException);
      expect(storage.createPresignedUpload).not.toHaveBeenCalled();
    });
  });

  describe('markUploaded', () => {
    const uploading = {
      id: VIDEO_ID,
      status: VideoStatus.UPLOADING,
      sourceKey: SOURCE_KEY,
    };

    it('queues the video with the size read off the object, not the declared one', async () => {
      prisma.video.findUnique.mockResolvedValue(uploading);
      storage.statObject.mockResolvedValue({ sizeBytes: 4096, contentType: 'video/mp4' });
      prisma.video.update.mockResolvedValue({
        id: VIDEO_ID,
        status: VideoStatus.QUEUED,
        transcodeAttempts: 1,
      });

      await service.markUploaded(VIDEO_ID);

      expect(prisma.video.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: VideoStatus.QUEUED,
            sizeBytes: 4096,
            contentType: 'video/mp4',
          }),
        }),
      );
      expect(transcodeQueue.enqueue).toHaveBeenCalledWith({
        videoId: VIDEO_ID,
        sourceKey: SOURCE_KEY,
        attempt: 1,
      });
    });

    // The fencing token has to move with the job, or a callback from this attempt would
    // be indistinguishable from one belonging to the attempt it replaced.
    it('bumps the attempt token and enqueues the value it committed', async () => {
      prisma.video.findUnique.mockResolvedValue(uploading);
      storage.statObject.mockResolvedValue({ sizeBytes: 4096, contentType: 'video/mp4' });
      prisma.video.update.mockResolvedValue({
        id: VIDEO_ID,
        status: VideoStatus.QUEUED,
        transcodeAttempts: 4,
      });

      await service.markUploaded(VIDEO_ID);

      expect(prisma.video.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ transcodeAttempts: { increment: 1 } }),
        }),
      );
      expect(transcodeQueue.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ attempt: 4 }),
      );
    });

    // The row is already committed as QUEUED, so a broker outage must not turn a
    // successful confirmation into a 5xx. The reconciler picks the row up instead.
    it('logs rather than throws when the broker refuses the job', async () => {
      prisma.video.findUnique.mockResolvedValue(uploading);
      storage.statObject.mockResolvedValue({ sizeBytes: 4096, contentType: 'video/mp4' });
      prisma.video.update.mockResolvedValue({
        id: VIDEO_ID,
        status: VideoStatus.QUEUED,
        transcodeAttempts: 1,
      });
      transcodeQueue.enqueue.mockRejectedValue(new Error('redis unreachable'));

      await expect(service.markUploaded(VIDEO_ID)).resolves.toEqual(
        expect.objectContaining({ status: VideoStatus.QUEUED }),
      );
    });

    // The admin entity is an explicit response shape; the fencing token is internal
    // bookkeeping and must not ride along just because the select needed it.
    it('does not leak the attempt token into the response', async () => {
      prisma.video.findUnique.mockResolvedValue(uploading);
      storage.statObject.mockResolvedValue({ sizeBytes: 4096, contentType: 'video/mp4' });
      prisma.video.update.mockResolvedValue({
        id: VIDEO_ID,
        status: VideoStatus.QUEUED,
        transcodeAttempts: 2,
      });

      const result = await service.markUploaded(VIDEO_ID);

      expect(result).not.toHaveProperty('transcodeAttempts');
    });

    it('409s on a re-confirm so the job is never enqueued twice', async () => {
      prisma.video.findUnique.mockResolvedValue({ ...uploading, status: VideoStatus.QUEUED });

      await expect(service.markUploaded(VIDEO_ID)).rejects.toBeInstanceOf(ConflictException);
      expect(transcodeQueue.enqueue).not.toHaveBeenCalled();
    });

    it('404s for a video that does not exist', async () => {
      prisma.video.findUnique.mockResolvedValue(null);

      await expect(service.markUploaded(VIDEO_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    // Each of these is a client that talked to the bucket and produced something other
    // than what it promised — or nothing at all.
    it.each([
      ['no object was uploaded', null],
      ['the object is empty', { sizeBytes: 0, contentType: 'video/mp4' }],
      ['the object is over the cap', { sizeBytes: MAX_VIDEO_BYTES + 1, contentType: 'video/mp4' }],
      ['the object is not a video', { sizeBytes: 4096, contentType: 'text/plain' }],
      ['the object has no type at all', { sizeBytes: 4096, contentType: null }],
    ])('marks the video FAILED and rejects when %s', async (_label, stored) => {
      prisma.video.findUnique.mockResolvedValue(uploading);
      storage.statObject.mockResolvedValue(stored);

      await expect(service.markUploaded(VIDEO_ID)).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.video.update).toHaveBeenCalledWith({
        where: { id: VIDEO_ID },
        data: { status: VideoStatus.FAILED },
      });
      expect(transcodeQueue.enqueue).not.toHaveBeenCalled();
    });
  });

  describe('createUploadUrl', () => {
    const retryDto = { contentType: 'video/mp4' as const, sizeBytes: 2048 };

    it.each([[VideoStatus.UPLOADING], [VideoStatus.FAILED]])(
      'reuses the same key when retrying a %s video',
      async (status) => {
        prisma.video.findUnique.mockResolvedValue({ id: VIDEO_ID, status, sourceKey: SOURCE_KEY });

        const ticket = await service.createUploadUrl(VIDEO_ID, retryDto);

        expect(storage.createPresignedUpload).toHaveBeenCalledWith(SOURCE_KEY, 'video/mp4');
        expect(ticket.video).not.toHaveProperty('sourceKey');
      },
    );

    // markUploaded only accepts UPLOADING, so a retry that left the row FAILED would
    // hand out a URL for an upload that could never then be confirmed.
    it('returns a failed video to UPLOADING and clears the previous attempt', async () => {
      prisma.video.findUnique.mockResolvedValue({
        id: VIDEO_ID,
        status: VideoStatus.FAILED,
        sourceKey: SOURCE_KEY,
      });

      await service.createUploadUrl(VIDEO_ID, retryDto);

      expect(prisma.video.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: VideoStatus.UPLOADING, sizeBytes: null, contentType: null },
        }),
      );
    });

    it.each([[VideoStatus.READY], [VideoStatus.QUEUED]])(
      '409s rather than re-presigning a %s video',
      async (status) => {
        prisma.video.findUnique.mockResolvedValue({ id: VIDEO_ID, status, sourceKey: SOURCE_KEY });

        await expect(service.createUploadUrl(VIDEO_ID, retryDto)).rejects.toBeInstanceOf(
          ConflictException,
        );
        expect(storage.createPresignedUpload).not.toHaveBeenCalled();
      },
    );
  });

  describe('remove', () => {
    it('deletes the row and then its object', async () => {
      prisma.video.findUnique.mockResolvedValue({
        id: VIDEO_ID,
        status: VideoStatus.FAILED,
        sourceKey: SOURCE_KEY,
      });

      await service.remove(VIDEO_ID);

      expect(prisma.video.delete).toHaveBeenCalledWith({ where: { id: VIDEO_ID } });
      expect(storage.deletePrefix).toHaveBeenCalledWith(`videos/${VIDEO_ID}/`);
      expect(storage.deleteObject).toHaveBeenCalledWith(SOURCE_KEY);
    });

    it('retires published content and cleans its complete storage prefix', async () => {
      prisma.video.findUnique.mockResolvedValue({
        id: VIDEO_ID,
        status: VideoStatus.READY,
        sourceKey: SOURCE_KEY,
      });

      await expect(service.remove(VIDEO_ID)).resolves.toBeUndefined();
      expect(prisma.video.delete).toHaveBeenCalledWith({ where: { id: VIDEO_ID } });
      expect(storage.deletePrefix).toHaveBeenCalledWith(`videos/${VIDEO_ID}/`);
      expect(storage.deleteObject).toHaveBeenCalledWith(SOURCE_KEY);
    });

    // Deleting mid-transcode orphans whatever the worker has already written under
    // videos/{id}/ and leaves its callback pointing at nothing.
    it('409s while a worker is mid-transcode', async () => {
      prisma.video.findUnique.mockResolvedValue({
        id: VIDEO_ID,
        status: VideoStatus.PROCESSING,
        sourceKey: SOURCE_KEY,
      });

      await expect(service.remove(VIDEO_ID)).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.video.delete).not.toHaveBeenCalled();
    });

    // An orphaned object is recoverable; a row pointing at a deleted object is a video
    // that can never be played or retried. So the row deletion stands either way.
    it('still reports success when the object cannot be removed', async () => {
      prisma.video.findUnique.mockResolvedValue({
        id: VIDEO_ID,
        status: VideoStatus.UPLOADING,
        sourceKey: SOURCE_KEY,
      });
      storage.deleteObject.mockRejectedValue(new Error('bucket unreachable'));

      await expect(service.remove(VIDEO_ID)).resolves.toBeUndefined();
      expect(prisma.video.delete).toHaveBeenCalled();
    });
  });

  describe('retranscode', () => {
    const failed = { id: VIDEO_ID, status: VideoStatus.FAILED, sourceKey: SOURCE_KEY };

    beforeEach(() => {
      prisma.video.update.mockResolvedValue({
        id: VIDEO_ID,
        status: VideoStatus.QUEUED,
        transcodeAttempts: 2,
      });
    });

    it('re-queues from the source already in the bucket, clearing the last failure', async () => {
      prisma.video.findUnique.mockResolvedValue(failed);
      storage.statObject.mockResolvedValue({ sizeBytes: 4096, contentType: 'video/mp4' });

      await expect(service.retry(VIDEO_ID)).resolves.toEqual(
        expect.objectContaining({ status: VideoStatus.QUEUED }),
      );

      expect(prisma.video.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: VideoStatus.QUEUED,
            failureReason: null,
            transcodeAttempts: { increment: 1 },
          }),
        }),
      );
      // No new upload URL is issued: the whole point is not to re-upload the source.
      expect(storage.createPresignedUpload).not.toHaveBeenCalled();
      expect(transcodeQueue.enqueue).toHaveBeenCalledWith({
        videoId: VIDEO_ID,
        sourceKey: SOURCE_KEY,
        attempt: 2,
      });
    });

    // The old ladder's rows describe objects the next run overwrites or deletes.
    it('clears the previous attempt\'s renditions in the same transaction', async () => {
      prisma.video.findUnique.mockResolvedValue(failed);
      storage.statObject.mockResolvedValue({ sizeBytes: 4096, contentType: 'video/mp4' });

      await service.retry(VIDEO_ID);

      expect(prisma.videoRendition.deleteMany).toHaveBeenCalledWith({
        where: { videoId: VIDEO_ID },
      });
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('404s for a video that does not exist', async () => {
      prisma.video.findUnique.mockResolvedValue(null);
      await expect(service.retry(VIDEO_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    // Re-driving a live job would put a second worker on it; READY needs no rescuing.
    it.each([VideoStatus.UPLOADING, VideoStatus.QUEUED, VideoStatus.PROCESSING, VideoStatus.READY])(
      '409s for a %s video',
      async (status) => {
        prisma.video.findUnique.mockResolvedValue({ ...failed, status });

        await expect(service.retry(VIDEO_ID)).rejects.toBeInstanceOf(ConflictException);
        expect(transcodeQueue.enqueue).not.toHaveBeenCalled();
      },
    );

    // Without this the job would simply fail again, and the admin would learn nothing for
    // another reconciler window.
    it('409s when the source object is no longer in the bucket', async () => {
      prisma.video.findUnique.mockResolvedValue(failed);
      storage.statObject.mockResolvedValue(null);

      await expect(service.retry(VIDEO_ID)).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(transcodeQueue.enqueue).not.toHaveBeenCalled();
    });

    it('logs rather than throws when the broker refuses the job', async () => {
      prisma.video.findUnique.mockResolvedValue(failed);
      storage.statObject.mockResolvedValue({ sizeBytes: 4096, contentType: 'video/mp4' });
      transcodeQueue.enqueue.mockRejectedValue(new Error('redis unreachable'));

      await expect(service.retry(VIDEO_ID)).resolves.toEqual(
        expect.objectContaining({ status: VideoStatus.QUEUED }),
      );
    });
  });

  describe('findAllForAdmin', () => {
    // The admin library is the only place a stuck row is ever observed, so the sweep runs
    // before the read rather than on a timer.
    it('sweeps stale transcodes before listing', async () => {
      await service.findAllForAdmin();

      expect(reconciler.sweepStale).toHaveBeenCalled();
      expect(reconciler.sweepStale.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.video.findMany.mock.invocationCallOrder[0],
      );
    });
  });

  describe('school-facing reads', () => {
    it('narrows a single read to READY, so an in-flight upload reads as missing', async () => {
      prisma.video.findFirst.mockResolvedValue(null);

      await service
        .findOneVisibleTo(VIDEO_ID, {
          sub: 'u1',
          email: 't@example.com',
          name: 'T',
          role: 'TEACHER',
          schoolId: 'school-1',
        } as never)
        .catch(() => undefined);

      expect(prisma.video.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: VideoStatus.READY }),
        }),
      );
    });
  });
});
