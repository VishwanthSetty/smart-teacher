import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VideoStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Fails videos whose transcode never came back.
 *
 * We own reliability here — there is no provider SLA to lean on. A worker's machine can
 * go to sleep mid-job, a laptop can be closed, a VM can be terminated; in each case the
 * row is left claiming work that nobody is doing.
 *
 * Opportunistic rather than scheduled, matching the precedent this codebase has already
 * set twice (LoginThrottleService's attempt pruning, the import services' draft sweep) —
 * no @nestjs/schedule. Unlike those, the stale rows here are *user-visible* and a stuck
 * one is a functional dead end: createUploadUrl 409s, remove() 409s on PROCESSING, and
 * retranscode only accepts FAILED. So the sweep runs on the read that would display them,
 * which makes the admin list correct at the moment of observation — strictly better than
 * a 10-minute cron, which has a 10-minute window in which the list lies.
 *
 * sweepStale() is deliberately scheduler-agnostic: if liveness independent of admin
 * traffic is ever needed, a @Cron calls this exact method with no other change.
 */
@Injectable()
export class TranscodeReconcilerService {
  private readonly logger = new Logger(TranscodeReconcilerService.name);
  private readonly staleAfterMs: number;

  constructor(
    private readonly prisma: PrismaService,
    configService: ConfigService,
  ) {
    this.staleAfterMs =
      configService.getOrThrow<number>('TRANSCODE_STALE_AFTER_MINS') * 60 * 1000;
  }

  async sweepStale(): Promise<number> {
    const cutoff = new Date(Date.now() - this.staleAfterMs);

    // updatedAt, not createdAt: the clock restarts when a worker actually claims the job
    // (QUEUED -> PROCESSING), so a job legitimately re-queued after a stall does not
    // inherit the original attempt's clock and get failed mid-flight. BullMQ's own retry
    // backoff tops out around two minutes, far inside any sane window.
    //
    // updateMany is idempotent, so two requests racing this is harmless. Backed by
    // Video's @@index([status, updatedAt]).
    const { count } = await this.prisma.video.updateMany({
      where: {
        status: { in: [VideoStatus.QUEUED, VideoStatus.PROCESSING] },
        updatedAt: { lt: cutoff },
      },
      data: {
        status: VideoStatus.FAILED,
        failureReason: 'Transcoding did not complete in time',
      },
    });

    if (count > 0) {
      this.logger.warn(`Swept ${count} stale transcode(s) to FAILED (no progress since ${cutoff.toISOString()}).`);
    }

    return count;
  }
}
