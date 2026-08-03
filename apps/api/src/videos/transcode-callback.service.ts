import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { VideoStatus } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { TranscodeCallbackDto, TranscodeResult } from './dto/transcode-callback.dto';
import { TranscodeAckEntity } from './entities/transcode-ack.entity';

/**
 * Applies a transcode worker's report to the Video row.
 *
 * This lives in videos/ rather than transcoding/ because it is a Video lifecycle
 * transition: VideosModule already imports TranscodingModule for the queue port, so a
 * controller in transcoding/ that writes Video would need forwardRef or a second module
 * owning Video. transcoding/ stays a pure queue-port module.
 *
 * Everything here must be idempotent. BullMQ guarantees exactly-once *leasing*, not
 * exactly-once *execution* — a crashed worker's job is re-run by design, so a duplicate
 * callback is a normal event, not an anomaly.
 *
 * It touches only Video and VideoRendition, both PLATFORM_GLOBAL_MODELS. That is what
 * makes it safe on a @WorkerRoute(), where no tenant context is populated.
 */
@Injectable()
export class TranscodeCallbackService {
  private readonly logger = new Logger(TranscodeCallbackService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly storage: StorageService,
  ) {}

  async record(dto: TranscodeCallbackDto): Promise<TranscodeAckEntity> {
    const video = await this.prisma.video.findUnique({
      where: { id: dto.videoId },
      select: {
        id: true,
        status: true,
        transcodeAttempts: true,
        retainSource: true,
        sourceKey: true,
      },
    });

    if (video === null) {
      // 404 rather than a silent 200: the worker treats 4xx as terminal and stops, which
      // is right — a job for a deleted video has nothing left to do.
      throw new NotFoundException('Video not found');
    }

    // Checked before any status logic: a callback from a superseded attempt is wrong
    // whatever state the row is in. Without this, a zombie worker finishing 50 minutes
    // late could overwrite the result of the retry that replaced it.
    if (dto.attempt !== video.transcodeAttempts) {
      throw new ConflictException('This transcode attempt has been superseded');
    }

    if (video.status === VideoStatus.UPLOADING) {
      // The row was reset for a fresh upload. Applying output produced from the *previous*
      // source would publish the wrong media under the right title.
      throw new ConflictException('This video is awaiting a new upload');
    }

    switch (dto.result) {
      case TranscodeResult.STARTED:
        return this.recordStarted(video.id, video.status);
      case TranscodeResult.SUCCEEDED:
        return this.recordSucceeded(
          video.id,
          video.status,
          dto,
          video.retainSource,
          video.sourceKey,
        );
      case TranscodeResult.FAILED:
        return this.recordFailed(video.id, video.status, dto);
    }
  }

  private async recordStarted(id: string, status: VideoStatus): Promise<TranscodeAckEntity> {
    if (status === VideoStatus.PROCESSING) {
      return { videoId: id, status };
    }
    if (status !== VideoStatus.QUEUED) {
      // READY or FAILED: whatever this worker leased is no longer the live attempt in any
      // useful sense. Telling it so now saves an entire transcode.
      throw new ConflictException('This video is not awaiting transcoding');
    }

    const started = await this.prisma.video.update({
      where: { id },
      data: { status: VideoStatus.PROCESSING, transcodeStartedAt: new Date() },
      select: { status: true },
    });
    return { videoId: id, status: started.status };
  }

  private async recordSucceeded(
    id: string,
    status: VideoStatus,
    dto: TranscodeCallbackDto,
    retainSource: boolean | null,
    sourceKey: string | null,
  ): Promise<TranscodeAckEntity> {
    if (status === VideoStatus.READY) {
      // The re-leased duplicate: the output is already applied and identical. Writing it
      // again would only churn rendition rows.
      return { videoId: id, status };
    }

    if (status === VideoStatus.FAILED) {
      // The legitimate late finisher. The reconciler's FAILED was a guess about liveness
      // that turned out wrong: the attempt token proves nothing superseded this job, and
      // the output really is in the bucket.
      this.logger.warn(`Video ${id} succeeded after being swept to FAILED; publishing it anyway.`);
    }

    // The DTO's @ValidateIf guarantees these on a succeeded result, but the compiler
    // cannot see that, and CLAUDE.md forbids `!`. Treat a violation as a bad request
    // rather than writing a half-published row.
    const { durationSecs, playlistKey, posterKey, renditions } = dto;
    if (
      durationSecs === undefined ||
      playlistKey === undefined ||
      posterKey === undefined ||
      renditions === undefined
    ) {
      throw new ConflictException('A successful transcode must report its output');
    }

    // One transaction: a row flipped to READY whose renditions failed to write is a video
    // that plays at one bitrate and never adapts.
    //
    // deleteMany-then-createMany rather than upsert: a re-run with a *narrower* ladder
    // must not leave orphaned rows describing objects the worker has just deleted.
    await this.prisma.$transaction([
      this.prisma.videoRendition.deleteMany({ where: { videoId: id } }),
      this.prisma.videoRendition.createMany({
        data: renditions.map((rendition) => ({ videoId: id, ...rendition })),
      }),
      this.prisma.video.update({
        where: { id },
        data: {
          status: VideoStatus.READY,
          durationSecs,
          playlistKey,
          posterKey,
          failureReason: null,
        },
      }),
    ]);

    const shouldRetain =
      retainSource ?? this.configService.getOrThrow<boolean>('RETAIN_INGEST_SOURCE');
    if (!shouldRetain && sourceKey !== null) {
      try {
        await this.storage.deleteObject(sourceKey);
        await this.prisma.video.update({ where: { id }, data: { sourceKey: null } });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Published video ${id} but retained ${sourceKey}: ${reason}`);
      }
    }

    return { videoId: id, status: VideoStatus.READY };
  }

  private async recordFailed(
    id: string,
    status: VideoStatus,
    dto: TranscodeCallbackDto,
  ): Promise<TranscodeAckEntity> {
    // The single most important rule here: never demote a live video. Schools may already
    // be watching it, and a zombie worker's death must not take it offline. The successful
    // attempt that produced it has already been proven current by the fencing token.
    if (status === VideoStatus.READY) {
      this.logger.warn(`Ignored a failure callback for video ${id}, which is already READY.`);
      return { videoId: id, status };
    }

    if (status === VideoStatus.FAILED) {
      return { videoId: id, status };
    }

    // sourceKey, sizeBytes and contentType are deliberately left intact: they are what an
    // admin diagnoses the failure with, and what the retry route re-drives from.
    const failed = await this.prisma.video.update({
      where: { id },
      data: { status: VideoStatus.FAILED, failureReason: dto.failureReason ?? 'Transcoding failed' },
      select: { status: true },
    });
    return { videoId: id, status: failed.status };
  }
}
