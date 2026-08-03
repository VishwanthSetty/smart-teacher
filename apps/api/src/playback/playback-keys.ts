const RENDITION_NAME = /^[A-Za-z0-9_-]+$/;
const SEGMENT_NAME = /^segment_\d+\.ts$/;

export function masterUri(uri: string, renditionNames: ReadonlySet<string>): string {
  const match = /^([A-Za-z0-9_-]+)\/playlist\.m3u8$/.exec(uri);
  if (match === null || !renditionNames.has(match[1])) throw new Error('Invalid master URI');
  return uri;
}

export function variantUri(uri: string, rendition: string): string {
  if (!RENDITION_NAME.test(rendition)) throw new Error('Invalid rendition');
  const prefix = `${rendition}/`;
  const segment = uri.startsWith(prefix) ? uri.slice(prefix.length) : uri;
  if (!SEGMENT_NAME.test(segment)) throw new Error('Invalid segment URI');
  return uri;
}

export function segmentKey(videoId: string, rendition: string, segment: string): string {
  if (!RENDITION_NAME.test(rendition) || !SEGMENT_NAME.test(segment)) {
    throw new Error('Invalid segment path');
  }
  return `videos/${videoId}/${rendition}/${segment}`;
}
