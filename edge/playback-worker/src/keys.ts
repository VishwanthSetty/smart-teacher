const VIDEO_ID = '[A-Za-z0-9_-]+';
const RENDITION = '[A-Za-z0-9_-]+';
const MEDIA_KEY = new RegExp(`^videos/(${VIDEO_ID})/(?:master\\.m3u8|poster\\.jpg|${RENDITION}/(?:playlist\\.m3u8|segment_\\d+\\.ts))$`);

export interface PlaybackKey {
  key: string;
  videoId: string;
  manifest: boolean;
}

export function playbackKey(pathname: string): PlaybackKey | null {
  const key = pathname.startsWith('/') ? pathname.slice(1) : pathname;
  const match = MEDIA_KEY.exec(key);
  if (match === null) return null;
  return { key, videoId: match[1], manifest: key.endsWith('.m3u8') };
}
