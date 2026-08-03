export type DeliveryMode = 'api' | 'edge';

export function playbackUrls(
  mode: DeliveryMode,
  origin: string,
  videoId: string,
  hasPoster: boolean,
  token: string,
): { manifestUrl: string; posterUrl: string | null } {
  const base = origin.replace(/\/$/, '');
  const query = `?t=${encodeURIComponent(token)}`;
  const manifestPath = mode === 'edge'
    ? `/videos/${videoId}/master.m3u8`
    : `/videos/${videoId}/hls/master.m3u8`;
  return {
    manifestUrl: `${base}${manifestPath}${query}`,
    posterUrl: hasPoster ? `${base}/videos/${videoId}/poster.jpg${query}` : null,
  };
}
