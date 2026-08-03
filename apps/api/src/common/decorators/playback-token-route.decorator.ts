import { SetMetadata } from '@nestjs/common';

export const IS_PLAYBACK_TOKEN_ROUTE_KEY = 'isPlaybackTokenRoute';

// The same metadata excuses JWT/Roles guards and activates PlaybackTokenGuard, so a
// token route cannot accidentally be declared without enforcement.
export const PlaybackTokenRoute = () => SetMetadata(IS_PLAYBACK_TOKEN_ROUTE_KEY, true);
