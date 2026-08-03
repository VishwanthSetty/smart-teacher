export interface VideoDimensions {
  width: number;
  height: number;
}

/**
 * Reads the dimensions ffmpeg measured into each EXT-X-STREAM-INF entry.
 *
 * The URI is the key because it is stable across ffmpeg versions and directly identifies
 * the rendition. Attribute ordering is deliberately ignored.
 */
export function parseMasterPlaylistDimensions(
  playlist: string,
): ReadonlyMap<string, VideoDimensions> {
  const lines = playlist.split(/\r?\n/).map((line) => line.trim());
  const dimensions = new Map<string, VideoDimensions>();

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.startsWith('#EXT-X-STREAM-INF:')) {
      continue;
    }

    const match = /(?:^|,)RESOLUTION=(\d+)x(\d+)(?:,|$)/.exec(
      line.slice('#EXT-X-STREAM-INF:'.length),
    );
    if (match === null) {
      throw new Error('ffmpeg\'s master playlist has a variant without a resolution.');
    }

    let uri: string | undefined;
    while (index + 1 < lines.length) {
      index += 1;
      const candidate = lines[index];
      if (candidate.length > 0 && !candidate.startsWith('#')) {
        uri = candidate;
        break;
      }
    }
    if (uri === undefined) {
      throw new Error('ffmpeg\'s master playlist has a variant without a playlist URI.');
    }
    if (dimensions.has(uri)) {
      throw new Error(`ffmpeg's master playlist contains duplicate variant URI ${uri}.`);
    }

    dimensions.set(uri, { width: Number(match[1]), height: Number(match[2]) });
  }

  return dimensions;
}
