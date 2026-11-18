import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import type { ListNotificationsQueryDto, RegisterDeviceDto, UpdateNotificationPreferenceDto } from './dto/notification.dto';
import { PushService } from './push/push.service';

type NotificationTx = Pick<PrismaService, 'notification'>;

export interface NotificationInput {
  schoolId: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Prisma.InputJsonValue;
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  async createMany(tx: NotificationTx, inputs: readonly NotificationInput[]): Promise<void> {
    if (inputs.length === 0) return;
    await tx.notification.createMany({
      data: inputs.map((input) => ({ ...input, data: input.data ?? {} })),
    });
  }

  async deliverTo(userId: string, payload: NotificationInput): Promise<void> {
    const preference = await this.getPreferenceFor(userId);
    if (!preference.pushEnabled || isQuietNow(preference.quietFromMins, preference.quietToMins)) {
      return;
    }
    const devices = await this.prisma.deviceToken.findMany({
      where: { userId },
      select: { token: true },
    });
    await this.push.send(
      devices.map((device) => device.token),
      {
        title: payload.title,
        body: payload.body,
        data: jsonToStringRecord(payload.data ?? {}),
      },
    );
  }

  list(actor: AuthenticatedUser, query: ListNotificationsQueryDto) {
    return this.prisma.notification.findMany({
      where: { userId: actor.sub, ...(query.unread ? { readAt: null } : {}) },
      take: 21,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }

  async markRead(id: string, actor: AuthenticatedUser) {
    const row = await this.prisma.notification.findFirst({ where: { id, userId: actor.sub } });
    if (!row) throw new NotFoundException('Notification not found');
    return this.prisma.notification.update({
      where: { id },
      data: { readAt: row.readAt ?? new Date() },
    });
  }

  async markAllRead(actor: AuthenticatedUser): Promise<{ updated: number }> {
    const result = await this.prisma.notification.updateMany({
      where: { userId: actor.sub, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }

  getPreference(actor: AuthenticatedUser) {
    return this.getPreferenceFor(actor.sub);
  }

  async updatePreference(dto: UpdateNotificationPreferenceDto, actor: AuthenticatedUser) {
    validateQuietHours(dto);
    if (!actor.schoolId) throw new BadRequestException('A tenant account is required');
    return this.prisma.notificationPreference.upsert({
      where: { userId: actor.sub },
      create: { schoolId: actor.schoolId, userId: actor.sub, ...dto },
      update: dto,
    });
  }

  async registerDevice(dto: RegisterDeviceDto, actor: AuthenticatedUser) {
    if (!actor.schoolId) throw new BadRequestException('A tenant account is required');
    const existing = await this.prisma.deviceToken.findUnique({ where: { token: dto.token } });
    if (existing) {
      return this.prisma.deviceToken.update({
        where: { id: existing.id },
        data: { userId: actor.sub, platform: dto.platform, lastSeenAt: new Date() },
      });
    }
    return this.prisma.deviceToken.create({
      data: { schoolId: actor.schoolId, userId: actor.sub, ...dto },
    });
  }

  async removeDevice(id: string, actor: AuthenticatedUser): Promise<void> {
    const row = await this.prisma.deviceToken.findFirst({ where: { id, userId: actor.sub } });
    if (!row) throw new NotFoundException('Device not found');
    await this.prisma.deviceToken.delete({ where: { id } });
  }

  private getPreferenceFor(userId: string) {
    return this.prisma.notificationPreference.findUnique({ where: { userId } }).then((row) =>
      row ?? {
        userId,
        inAppEnabled: true,
        pushEnabled: true,
        taskRemindersEnabled: true,
        dueSoonLeadMins: 1440,
        quietFromMins: null,
        quietToMins: null,
      },
    );
  }
}

function validateQuietHours(dto: UpdateNotificationPreferenceDto): void {
  const oneProvided = (dto.quietFromMins === null) !== (dto.quietToMins === null);
  const oneMissing = (dto.quietFromMins === undefined) !== (dto.quietToMins === undefined);
  if (oneProvided || oneMissing) {
    throw new BadRequestException('quietFromMins and quietToMins must be set or cleared together');
  }
}

function isQuietNow(from: number | null, to: number | null): boolean {
  if (from === null || to === null || from === to) return false;
  const now = new Date();
  const minute = now.getUTCHours() * 60 + now.getUTCMinutes();
  return from < to ? minute >= from && minute < to : minute >= from || minute < to;
}

function jsonToStringRecord(value: Prisma.InputJsonValue): Record<string, string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, String(item)]));
}
