import { Controller, Get, Header, Param, Redirect } from '@nestjs/common';
import { ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import { PlaybackTokenRoute } from '../common/decorators/playback-token-route.decorator';
import { PlaybackService } from './playback.service';
import { CurrentPlaybackToken } from './current-playback-token.decorator';

@ApiTags('playback')
@Controller('videos')
export class PlaybackDeliveryController {
  constructor(private readonly playback: PlaybackService) {}

  @Get(':id/hls/master.m3u8')
  @PlaybackTokenRoute()
  @Header('Content-Type', 'application/vnd.apple.mpegurl')
  @Header('Cache-Control', 'no-store')
  @ApiExcludeEndpoint()
  master(@Param('id') id: string, @CurrentPlaybackToken() token: string): Promise<string> {
    return this.playback.masterManifest(id, token);
  }

  @Get(':id/hls/:rendition/playlist.m3u8')
  @PlaybackTokenRoute()
  @Header('Content-Type', 'application/vnd.apple.mpegurl')
  @Header('Cache-Control', 'no-store')
  @ApiExcludeEndpoint()
  variant(
    @Param('id') id: string,
    @Param('rendition') rendition: string,
    @CurrentPlaybackToken() token: string,
  ): Promise<string> {
    return this.playback.variantManifest(id, rendition, token);
  }

  @Get(':id/hls/:rendition/:segment')
  @PlaybackTokenRoute()
  @Redirect(undefined, 302)
  @ApiExcludeEndpoint()
  async segment(
    @Param('id') id: string,
    @Param('rendition') rendition: string,
    @Param('segment') segment: string,
  ): Promise<{ url: string; statusCode: number }> {
    return { url: await this.playback.segmentUrl(id, rendition, segment), statusCode: 302 };
  }

  @Get(':id/poster.jpg')
  @PlaybackTokenRoute()
  @Redirect(undefined, 302)
  @ApiExcludeEndpoint()
  async poster(@Param('id') id: string): Promise<{ url: string; statusCode: number }> {
    return { url: await this.playback.posterUrl(id), statusCode: 302 };
  }
}
