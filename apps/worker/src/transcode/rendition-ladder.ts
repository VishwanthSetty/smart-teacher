export interface Rendition {
  name: string;
  height: number;
  videoBitrate: string;
  audioBitrate: string;
  /** The numeric form the callback reports, derived from videoBitrate. */
  bitrateKbps: number;
}

const ENTRY = /^([A-Za-z0-9]{1,16}):(\d{2,4}):(\d{1,6}k):(\d{1,5}k)$/;

/**
 * Parses RENDITION_LADDER, e.g. "360p:360:800k:96k,720p:720:2500k:128k".
 *
 * Height only, no width. `scale=w=-2:h=<height>` preserves the source aspect ratio and
 * guarantees an even width, which h264 with yuv420p requires. A declared width would
 * either fight the source's ratio or letterbox portrait footage, and the real dimensions
 * are measured off the produced segment anyway.
 *
 * The colon form rather than JSON because a JSON string inside a docker-compose
 * `environment:` block is a quoting minefield, and this has to be readable in a .env.
 *
 * Throws rather than falling back to a default: a silently-wrong ladder would encode an
 * entire 200-video batch at the wrong bitrates before anyone noticed.
 */
export function parseRenditionLadder(raw: string): Rendition[] {
  const entries = raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (entries.length === 0) {
    throw new Error('RENDITION_LADDER is empty; at least one rendition is required.');
  }

  const ladder = entries.map((entry) => {
    const match = ENTRY.exec(entry);
    if (match === null) {
      throw new Error(
        `RENDITION_LADDER entry "${entry}" is malformed; expected name:height:videoBitrate:audioBitrate (e.g. 360p:360:800k:96k).`,
      );
    }

    const [, name, heightText, videoBitrate, audioBitrate] = match;
    const height = Number(heightText);

    if (height % 2 !== 0) {
      throw new Error(`RENDITION_LADDER entry "${entry}" has an odd height; h264 requires even dimensions.`);
    }
    if (height < 16 || height > 4320) {
      throw new Error(`RENDITION_LADDER entry "${entry}" has a height outside 16-4320.`);
    }

    return {
      name,
      height,
      videoBitrate,
      audioBitrate,
      bitrateKbps: Number(videoBitrate.slice(0, -1)),
    };
  });

  const names = new Set(ladder.map((rendition) => rendition.name));
  if (names.size !== ladder.length) {
    throw new Error('RENDITION_LADDER has duplicate rendition names; each names its own output directory.');
  }

  // Strictly ascending, because var_stream_map order is the order a player walks the
  // master playlist. A ladder listed high-to-low would have clients starting at the
  // most expensive rung on a connection that cannot carry it.
  for (let i = 1; i < ladder.length; i += 1) {
    if (ladder[i].bitrateKbps <= ladder[i - 1].bitrateKbps) {
      throw new Error(
        `RENDITION_LADDER must ascend by video bitrate; "${ladder[i].name}" is not above "${ladder[i - 1].name}".`,
      );
    }
  }

  return ladder;
}
