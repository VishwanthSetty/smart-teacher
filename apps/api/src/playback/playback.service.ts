import { BadRequestException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { VideoStatus } from '@prisma/client';
import { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { VideosService } from '../videos/videos.service';
import { PlaybackTokenEntity } from './entities/playback-token.entity';
import { rewriteHlsManifest } from './hls-rewrite';
import { masterUri, segmentKey, variantUri } from './playback-keys';
import { PlaybackTokenService } from './playback-token.service';
import { DeliveryMode, playbackUrls } from './playback-urls';

@Injectable()
export class PlaybackService {
  constructor(
    private readonly videos: VideosService,
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly tokens: PlaybackTokenService,
    private readonly config: ConfigService,
  ) {}

  async createToken(id: string, actor: AuthenticatedUser): Promise<PlaybackTokenEntity> {
    const video = await this.videos.findPlayableVisibleTo(id, actor);
    const { token, expiresInSecs } = await this.tokens.mint(id, actor.sub);
    const mode = this.config.getOrThrow<DeliveryMode>('PLAYBACK_DELIVERY_MODE');
    const origin = this.config.getOrThrow<string>(
      mode === 'edge' ? 'PLAYBACK_EDGE_ORIGIN' : 'PLAYBACK_API_ORIGIN',
    );
    return {
      videoId: id,
      ...playbackUrls(mode, origin, id, video.posterKey !== null, token),
      durationSecs: video.durationSecs,
      expiresInSecs,
    };
  }

  async masterManifest(id: string, token: string): Promise<string> {
    const video = await this.deliveryVideo(id);
    const manifest = await this.storage.getObjectText(video.playlistKey);
    if (manifest === null) throw this.unplayable();
    const renditionNames = new Set(video.renditions.map(({ name }) => name));
    return this.rewrite(manifest, token, (uri) => masterUri(uri, renditionNames));
  }

  async variantManifest(id: string, rendition: string, token: string): Promise<string> {
    const video = await this.deliveryVideo(id);
    const row = video.renditions.find(({ name }) => name === rendition);
    if (row === undefined) throw new NotFoundException('Rendition not found');
    const manifest = await this.storage.getObjectText(row.playlistKey);
    if (manifest === null) throw this.unplayable();
    return this.rewrite(manifest, token, (uri) => variantUri(uri, rendition));
  }

  async segmentUrl(id: string, rendition: string, segment: string): Promise<string> {
    const video = await this.deliveryVideo(id);
    if (!video.renditions.some(({ name }) => name === rendition)) {
      throw new NotFoundException('Rendition not found');
    }
    let key: string;
    try {
      key = segmentKey(id, rendition, segment);
    } catch {
      throw new BadRequestException('Invalid media segment');
    }
    try {
      const download = await this.storage.createPresignedDownload(
        key,
      );
      return download.url;
    } catch (error) {
      if (error instanceof InternalServerErrorException) throw error;
      throw this.unplayable();
    }
  }

  async posterUrl(id: string): Promise<string> {
    const video = await this.deliveryVideo(id);
    if (video.posterKey === null) throw this.unplayable();
    return (await this.storage.createPresignedDownload(video.posterKey)).url;
  }

  private async deliveryVideo(id: string) {
    const video = await this.prisma.video.findFirst({
      where: { id, status: VideoStatus.READY },
      select: {
        playlistKey: true,
        posterKey: true,
        renditions: { select: { name: true, playlistKey: true } },
      },
    });
    if (video === null || video.playlistKey === null) throw this.unplayable();
    return { ...video, playlistKey: video.playlistKey };
  }

  private rewrite(manifest: string, token: string, validate: (uri: string) => string): string {
    try {
      return rewriteHlsManifest(manifest, (uri) => `${validate(uri)}?t=${encodeURIComponent(token)}`);
    } catch {
      throw this.unplayable();
    }
  }

  private unplayable(): InternalServerErrorException {
    return new InternalServerErrorException('This video cannot be played right now');
  }
}
