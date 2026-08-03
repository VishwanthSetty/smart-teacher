import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { WorkerRoute } from '../common/decorators/worker-route.decorator';
import { TranscodeCallbackService } from './transcode-callback.service';
import { TranscodeCallbackDto } from './dto/transcode-callback.dto';
import { TranscodeAckEntity } from './entities/transcode-ack.entity';

// How a transcode worker reports back. Not a user-facing surface: no bearer token, no
// Role, authenticated instead by WorkerAuthGuard's HMAC over the raw body — the analog of
// a provider's webhook-signature check, and identical whether the worker ran on a laptop
// or a cloud VM.
//
// Under /internal so the route's audience is obvious from the path alone. It reads and
// writes only Video and VideoRendition, both PLATFORM_GLOBAL_MODELS, which is what makes
// it safe without a tenant context.
@ApiTags('internal')
@Controller('internal/transcode')
export class TranscodeCallbackController {
  constructor(private readonly transcodeCallbackService: TranscodeCallbackService) {}

  // 200 for every outcome the worker can act on, including the no-ops. A retried or
  // re-leased job must be able to report its result without corrupting state, so the
  // duplicate cases return the current status rather than an error.
  @Post('callback')
  @WorkerRoute()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Transcode worker result callback (HMAC-signed, not JWT).' })
  @ApiResponse({ status: 200, type: TranscodeAckEntity })
  @ApiResponse({ status: 401, description: 'Missing, malformed, stale or mismatched signature.' })
  @ApiResponse({ status: 404, description: 'No such video; the worker should stop.' })
  @ApiResponse({
    status: 409,
    description: 'A superseded attempt, or a video not in a state this result applies to.',
  })
  record(@Body() dto: TranscodeCallbackDto): Promise<TranscodeAckEntity> {
    return this.transcodeCallbackService.record(dto);
  }
}
