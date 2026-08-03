import { mkdir, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { CallbackRendition } from '../callback/callback-payload';
import { HwaccelMode } from '../config/env.validation';
import { Logger } from '../logging/logger';
import { ObjectStorage } from '../storage/object-storage';
import { TranscodeJobData } from '../queue/transcode-job';
import { buildHlsArgs, buildPosterArgs } from './ffmpeg-args';
import { runFfmpeg, runFfprobe } from './ffmpeg';
import { parseMasterPlaylistDimensions } from './hls-master';
import { Rendition } from './rendition-ladder';

const SOURCE_FILE = 'source.mp4';
const OUTPUT_DIR = 'out';
const POSTER_FILE = 'poster.jpg';
const MASTER_PLAYLIST = 'master.m3u8';
const VARIANT_PLAYLIST = 'playlist.m3u8';

// Enough to saturate a home upstream link without opening so many sockets that the event
// loop — which is also renewing this job's lock — starts queueing.
const UPLOAD_CONCURRENCY = 8;

export interface TranscodeOutput {
  durationSecs: number;
  playlistKey: string;
  posterKey: string;
  renditions: CallbackRendition[];
}

export interface TranscodeDeps {
  storage: ObjectStorage;
  ladder: Rendition[];
  hwaccel: HwaccelMode;
  threads: number;
  logger: Logger;
}

/**
 * Source in the bucket -> HLS ladder in the bucket.
 *
 * Everything lands under `videos/{videoId}/`, alongside but separate from the source at
 * `{videoId}/source.mp4` that ingest wrote.
 */
export async function transcodeVideo(
  job: TranscodeJobData,
  workDir: string,
  deps: TranscodeDeps,
): Promise<TranscodeOutput> {
  const { storage, ladder, hwaccel, threads, logger } = deps;
  const input = join(workDir, SOURCE_FILE);
  const outputDir = join(workDir, OUTPUT_DIR);
  const prefix = `videos/${job.videoId}`;

  // ffmpeg will not create the directories behind its output template: %v expands to the
  // rendition name, and an absent out/360p/ fails the whole encode at the last moment with
  // a bare "No such file or directory".
  for (const rendition of ladder) {
    await mkdir(join(outputDir, rendition.name), { recursive: true });
  }

  await storage.getToFile(job.sourceKey, input);

  const probe = await runFfprobe(input);
  logger.info('Probed source', {
    videoId: job.videoId,
    durationSecs: probe.durationSecs,
    hasAudio: probe.hasAudio,
  });

  await runFfmpeg(buildHlsArgs(ladder, probe, { input, outputDir }, hwaccel, threads));
  // Separate invocation so a poster failure never costs the re-encode above.
  await runFfmpeg(buildPosterArgs(input, probe.durationSecs, join(outputDir, POSTER_FILE)));

  // Measured, not declared: the ladder specifies a height and lets ffmpeg derive an even
  // width from the source's aspect ratio. ffmpeg records the actual dimensions in the
  // master playlist, so read them there instead of probing an MPEG-TS segment. The pinned
  // ffprobe 7.0.2-static build can segfault on otherwise-valid MPEG-TS input.
  const dimensions = parseMasterPlaylistDimensions(
    await readFile(join(outputDir, MASTER_PLAYLIST), 'utf8'),
  );
  const renditions: CallbackRendition[] = [];
  for (const rendition of ladder) {
    const variantDir = join(outputDir, rendition.name);
    const segments = (await readdir(variantDir)).filter((file) => file.endsWith('.ts')).sort();
    if (segments.length === 0) {
      throw new Error(`ffmpeg produced no segments for the ${rendition.name} rendition.`);
    }

    const playlistUri = `${rendition.name}/${VARIANT_PLAYLIST}`;
    const measured = dimensions.get(playlistUri);
    if (measured === undefined) {
      throw new Error(`ffmpeg's master playlist contains no dimensions for ${playlistUri}.`);
    }
     renditions.push({
      name: rendition.name,
      width: measured.width,
      height: measured.height,
      bitrateKbps: rendition.bitrateKbps,
      playlistKey: `${prefix}/${rendition.name}/${VARIANT_PLAYLIST}`,
    });
  }

  // Before uploading, not after: a re-run with a *narrower* ladder would otherwise leave
  // the previous run's extra rungs in place, referenced by nothing and paid for forever.
  await storage.deletePrefix(`${prefix}/`);

  await uploadOutput(storage, outputDir, prefix, ladder);

  logger.info('Uploaded HLS output', {
    videoId: job.videoId,
    renditions: renditions.length,
  });

  return {
    durationSecs: probe.durationSecs,
    playlistKey: `${prefix}/${MASTER_PLAYLIST}`,
    posterKey: `${prefix}/${POSTER_FILE}`,
    renditions,
  };
}

/**
 * Uploads in dependency order: segments, then variant playlists, then master.m3u8 last.
 *
 * A client that fetches the master must never find it referencing an object that is not
 * there yet. This is the first of two barriers — the API only flips the row to READY once
 * the success callback lands, which is after the master is in place.
 */
async function uploadOutput(
  storage: ObjectStorage,
  outputDir: string,
  prefix: string,
  ladder: Rendition[],
): Promise<void> {
  const segmentUploads: Array<() => Promise<void>> = [];

  for (const rendition of ladder) {
    const variantDir = join(outputDir, rendition.name);
    const segments = (await readdir(variantDir)).filter((file) => file.endsWith('.ts'));

    for (const segment of segments) {
      segmentUploads.push(() =>
        storage.putFile(`${prefix}/${rendition.name}/${segment}`, join(variantDir, segment), 'video/mp2t'),
      );
    }
  }

  segmentUploads.push(() =>
    storage.putFile(`${prefix}/${POSTER_FILE}`, join(outputDir, POSTER_FILE), 'image/jpeg'),
  );

  await mapWithConcurrency(segmentUploads, UPLOAD_CONCURRENCY);

  for (const rendition of ladder) {
    await storage.putFile(
      `${prefix}/${rendition.name}/${VARIANT_PLAYLIST}`,
      join(outputDir, rendition.name, VARIANT_PLAYLIST),
      'application/vnd.apple.mpegurl',
    );
  }

  await storage.putFile(
    `${prefix}/${MASTER_PLAYLIST}`,
    join(outputDir, MASTER_PLAYLIST),
    'application/vnd.apple.mpegurl',
  );
}

// Twelve lines rather than a p-limit dependency in an image that already carries a
// ~100 MB static ffmpeg.
async function mapWithConcurrency(tasks: Array<() => Promise<void>>, limit: number): Promise<void> {
  let next = 0;

  const runners = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (next < tasks.length) {
      const index = next;
      next += 1;
      await tasks[index]();
    }
  });

  await Promise.all(runners);
}
