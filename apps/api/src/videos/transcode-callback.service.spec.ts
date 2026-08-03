import { ConflictException, NotFoundException } from '@nestjs/common';
import { VideoStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { StorageService } from '../storage/storage.service';
import { TranscodeCallbackService } from './transcode-callback.service';
import { TranscodeCallbackDto, TranscodeResult } from './dto/transcode-callback.dto';

const VIDEO_ID = 'vid_1';
const ATTEMPT = 3;

interface PrismaMock {
  video: { findUnique: jest.Mock; update: jest.Mock };
  videoRendition: { deleteMany: jest.Mock; createMany: jest.Mock };
  $transaction: jest.Mock;
}

function succeededDto(overrides: Partial<TranscodeCallbackDto> = {}): TranscodeCallbackDto {
  return {
    videoId: VIDEO_ID,
    result: TranscodeResult.SUCCEEDED,
    attempt: ATTEMPT,
    durationSecs: 612,
    playlistKey: `videos/${VIDEO_ID}/master.m3u8`,
    posterKey: `videos/${VIDEO_ID}/poster.jpg`,
    renditions: [
      {
        name: '360p',
        width: 640,
        height: 360,
        bitrateKbps: 800,
        playlistKey: `videos/${VIDEO_ID}/360p/playlist.m3u8`,
      },
      {
        name: '720p',
        width: 1280,
        height: 720,
        bitrateKbps: 2500,
        playlistKey: `videos/${VIDEO_ID}/720p/playlist.m3u8`,
      },
    ],
    ...overrides,
  };
}

function dtoFor(result: TranscodeResult, overrides: Partial<TranscodeCallbackDto> = {}) {
  if (result === TranscodeResult.SUCCEEDED) {
    return succeededDto(overrides);
  }
  return {
    videoId: VIDEO_ID,
    result,
    attempt: ATTEMPT,
    ...(result === TranscodeResult.FAILED ? { failureReason: 'Unsupported codec' } : {}),
    ...overrides,
  } as TranscodeCallbackDto;
}

describe('TranscodeCallbackService', () => {
  let prisma: PrismaMock;
  let service: TranscodeCallbackService;

  beforeEach(() => {
    prisma = {
      video: {
        findUnique: jest.fn(),
        update: jest.fn().mockImplementation(({ data }) => ({ status: data.status })),
      },
      videoRendition: { deleteMany: jest.fn(), createMany: jest.fn() },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    const config = { getOrThrow: jest.fn().mockReturnValue(true) } as unknown as ConfigService;
    const storage = { deleteObject: jest.fn() } as unknown as StorageService;
    service = new TranscodeCallbackService(prisma as unknown as PrismaService, config, storage);
    jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);
  });

  function givenVideo(status: VideoStatus, transcodeAttempts = ATTEMPT): void {
    prisma.video.findUnique.mockResolvedValue({
      id: VIDEO_ID,
      status,
      transcodeAttempts,
      retainSource: null,
      sourceKey: `${VIDEO_ID}/source.mp4`,
    });
  }

  describe('preconditions, checked before any status logic', () => {
    it('404s for a video that does not exist', async () => {
      prisma.video.findUnique.mockResolvedValue(null);
      await expect(service.record(dtoFor(TranscodeResult.SUCCEEDED))).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    // The fencing token. A worker that finishes long after the reconciler failed the row
    // and an admin re-drove it must not overwrite the replacement attempt's result.
    it.each([TranscodeResult.STARTED, TranscodeResult.SUCCEEDED, TranscodeResult.FAILED])(
      '409s a %s callback carrying a superseded attempt, whatever the status',
      async (result) => {
        givenVideo(VideoStatus.PROCESSING, ATTEMPT + 1);
        await expect(service.record(dtoFor(result))).rejects.toBeInstanceOf(ConflictException);
        expect(prisma.$transaction).not.toHaveBeenCalled();
        expect(prisma.video.update).not.toHaveBeenCalled();
      },
    );

    it.each([TranscodeResult.STARTED, TranscodeResult.SUCCEEDED, TranscodeResult.FAILED])(
      '409s a %s callback for a video reset to UPLOADING',
      async (result) => {
        givenVideo(VideoStatus.UPLOADING);
        await expect(service.record(dtoFor(result))).rejects.toBeInstanceOf(ConflictException);
      },
    );
  });

  describe('started', () => {
    it('moves QUEUED to PROCESSING and stamps transcodeStartedAt', async () => {
      givenVideo(VideoStatus.QUEUED);

      await expect(service.record(dtoFor(TranscodeResult.STARTED))).resolves.toEqual({
        videoId: VIDEO_ID,
        status: VideoStatus.PROCESSING,
      });
      expect(prisma.video.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: VIDEO_ID },
          data: expect.objectContaining({
            status: VideoStatus.PROCESSING,
            transcodeStartedAt: expect.any(Date),
          }),
        }),
      );
    });

    it('is a no-op when the video is already PROCESSING', async () => {
      givenVideo(VideoStatus.PROCESSING);

      await expect(service.record(dtoFor(TranscodeResult.STARTED))).resolves.toEqual({
        videoId: VIDEO_ID,
        status: VideoStatus.PROCESSING,
      });
      expect(prisma.video.update).not.toHaveBeenCalled();
    });

    // Telling the worker to abort here saves an entire transcode.
    it.each([VideoStatus.READY, VideoStatus.FAILED])('409s when the video is %s', async (status) => {
      givenVideo(status);
      await expect(service.record(dtoFor(TranscodeResult.STARTED))).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('succeeded', () => {
    it.each([VideoStatus.QUEUED, VideoStatus.PROCESSING])(
      'publishes a %s video, writing output and renditions in one transaction',
      async (status) => {
        givenVideo(status);

        await expect(service.record(succeededDto())).resolves.toEqual({
          videoId: VIDEO_ID,
          status: VideoStatus.READY,
        });

        expect(prisma.$transaction).toHaveBeenCalledTimes(1);
        expect(prisma.videoRendition.deleteMany).toHaveBeenCalledWith({
          where: { videoId: VIDEO_ID },
        });
        expect(prisma.videoRendition.createMany).toHaveBeenCalledWith({
          data: [
            expect.objectContaining({ videoId: VIDEO_ID, name: '360p', bitrateKbps: 800 }),
            expect.objectContaining({ videoId: VIDEO_ID, name: '720p', bitrateKbps: 2500 }),
          ],
        });
        expect(prisma.video.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              status: VideoStatus.READY,
              durationSecs: 612,
              playlistKey: `videos/${VIDEO_ID}/master.m3u8`,
              posterKey: `videos/${VIDEO_ID}/poster.jpg`,
              failureReason: null,
            }),
          }),
        );
      },
    );

    // Renditions are replaced wholesale, not upserted: a re-run with a narrower ladder
    // must not leave rows describing objects the worker has already deleted.
    it('clears existing renditions before writing the new set', async () => {
      givenVideo(VideoStatus.PROCESSING);
      await service.record(succeededDto());

      const order = prisma.$transaction.mock.calls[0][0];
      expect(order).toHaveLength(3);
    });

    it('is a no-op for a video that is already READY', async () => {
      givenVideo(VideoStatus.READY);

      await expect(service.record(succeededDto())).resolves.toEqual({
        videoId: VIDEO_ID,
        status: VideoStatus.READY,
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.videoRendition.createMany).not.toHaveBeenCalled();
    });

    // The late finisher: the reconciler's FAILED was a guess about liveness, and the
    // matching attempt token proves nothing superseded this job.
    it('publishes a video the reconciler had already swept to FAILED', async () => {
      givenVideo(VideoStatus.FAILED);

      await expect(service.record(succeededDto())).resolves.toEqual({
        videoId: VIDEO_ID,
        status: VideoStatus.READY,
      });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(service['logger'].warn).toHaveBeenCalled();
    });

    it('409s rather than half-publishing when the output fields are absent', async () => {
      givenVideo(VideoStatus.PROCESSING);
      const dto = succeededDto();
      delete dto.playlistKey;

      await expect(service.record(dto)).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('failed', () => {
    it.each([VideoStatus.QUEUED, VideoStatus.PROCESSING])(
      'fails a %s video and captures the reason',
      async (status) => {
        givenVideo(status);

        await expect(service.record(dtoFor(TranscodeResult.FAILED))).resolves.toEqual({
          videoId: VIDEO_ID,
          status: VideoStatus.FAILED,
        });
        expect(prisma.video.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: { status: VideoStatus.FAILED, failureReason: 'Unsupported codec' },
          }),
        );
      },
    );

    // The single most important anti-corruption rule in this service: schools may already
    // be watching the video, and a zombie worker's death must not take it offline.
    it('never demotes a READY video', async () => {
      givenVideo(VideoStatus.READY);

      await expect(service.record(dtoFor(TranscodeResult.FAILED))).resolves.toEqual({
        videoId: VIDEO_ID,
        status: VideoStatus.READY,
      });
      expect(prisma.video.update).not.toHaveBeenCalled();
      expect(service['logger'].warn).toHaveBeenCalled();
    });

    it('is a no-op for a video that is already FAILED', async () => {
      givenVideo(VideoStatus.FAILED);

      await expect(service.record(dtoFor(TranscodeResult.FAILED))).resolves.toEqual({
        videoId: VIDEO_ID,
        status: VideoStatus.FAILED,
      });
      expect(prisma.video.update).not.toHaveBeenCalled();
    });
  });
});
