import { INestApplication } from '@nestjs/common';
import { PrismaClient, Role, VideoStatus } from '@prisma/client';
import request from 'supertest';
import { createE2eApp } from './utils/e2e-app';
import { loginAllRoles, login, SEED_PASSWORD } from './utils/login';
import {
  ENTITLED_VIDEO_TITLE,
  seedContentFixtures,
  TEACHER_VIDEO_TITLE,
  UNENTITLED_VIDEO_TITLE,
} from './utils/content-fixtures';
import { PresignedDownload, StorageService, StoredObject } from '../src/storage/storage.service';
import { TranscodeQueue } from '../src/transcoding/transcode-queue';

interface Video {
  id: string;
  title: string;
  status: VideoStatus;
  failureReason: string | null;
  sizeBytes: number | null;
  contentType: string | null;
  contentNodeId: string;
}

// The fixtures entitle demo-school to exactly one curriculum per audience and demo-school-b
// to nothing. Every assertion below leans on that asymmetry — granting more in
// content-fixtures.ts would make these pass vacuously.
const ENTITLED_TITLE = ENTITLED_VIDEO_TITLE;
const UNENTITLED_TITLE = UNENTITLED_VIDEO_TITLE;

// Ingest fixtures are identified by this prefix so they can be cleaned up idempotently —
// a run that failed part-way must not leave rows that change the next run's library.
const INGEST_TITLE_PREFIX = 'e2e-ingest ';

const MP4 = 'video/mp4';

/**
 * In-memory stand-in for the bucket. The real adapter is exercised by its own unit spec;
 * here the point is the *service's* verification logic, so this lets a test decide
 * exactly what the storage layer claims to be holding — including "nothing", which is
 * the abandoned-upload case and cannot be produced by actually uploading.
 */
class FakeStorage extends StorageService {
  objects = new Map<string, StoredObject>();
  presignedKeys: string[] = [];
  deletedKeys: string[] = [];
  deletedPrefixes: string[] = [];

  async createPresignedUpload(key: string, contentType: string) {
    this.presignedKeys.push(key);
    return { url: `https://storage.test/${key}?sig=stub&type=${contentType}`, key, expiresInSecs: 900 };
  }

  async statObject(key: string): Promise<StoredObject | null> {
    return this.objects.get(key) ?? null;
  }

  async getObjectText(): Promise<string | null> { return null; }

  async createPresignedDownload(key: string): Promise<PresignedDownload> {
    return { url: `https://storage.test/${key}`, expiresInSecs: 300 };
  }

  async deleteObject(key: string): Promise<void> {
    this.deletedKeys.push(key);
    this.objects.delete(key);
  }

  async deletePrefix(prefix: string): Promise<void> { this.deletedPrefixes.push(prefix); }
}

describe('Videos (e2e)', () => {
  let app: INestApplication;
  let tokens: Record<Role, string>;
  let teacherB: string;
  let schoolAdminB: string;
  let library: Video[];
  let contentNodeId: string;
  let chapterNodeId: string;
  const storage = new FakeStorage();
  const transcodeQueue = { enqueue: jest.fn().mockResolvedValue(undefined) };

  const get = (path: string, token: string) =>
    request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${token}`);

  const post = (path: string, token: string) =>
    request(app.getHttpServer()).post(path).set('Authorization', `Bearer ${token}`);

  const del = (path: string, token: string) =>
    request(app.getHttpServer()).delete(path).set('Authorization', `Bearer ${token}`);

  const idOf = (title: string): string => {
    const video = library.find((v) => v.title === title);
    if (!video) {
      throw new Error(`Fixture video "${title}" is missing`);
    }
    return video.id;
  };

  // Creates a video and reports where its source is expected to land, so a test can put
  // an object there (or deliberately not).
  const createVideo = async (
    title: string,
    overrides: Record<string, unknown> = {},
  ): Promise<{ id: string; sourceKey: string; uploadUrl: string }> => {
    const res = await post('/admin/videos', tokens[Role.SUPER_ADMIN])
      .send({
        title: `${INGEST_TITLE_PREFIX}${title}`,
        contentNodeId,
        contentType: MP4,
        sizeBytes: 1024,
        ...overrides,
      })
      .expect(201);

    return {
      id: res.body.video.id,
      sourceKey: `${res.body.video.id}/source.mp4`,
      uploadUrl: res.body.uploadUrl,
    };
  };

  async function removeIngestFixtures(): Promise<void> {
    const prisma = new PrismaClient();
    try {
      await prisma.video.deleteMany({ where: { title: { startsWith: INGEST_TITLE_PREFIX } } });
    } finally {
      await prisma.$disconnect();
    }
  }

  // Stands in for the worker's failure callback, which has its own e2e spec. Here the
  // point is only to get a row into FAILED so the retry surface can be exercised.
  async function failVideo(id: string, reason = 'Transcoding failed'): Promise<void> {
    const prisma = new PrismaClient();
    try {
      await prisma.video.update({
        where: { id },
        data: { status: VideoStatus.FAILED, failureReason: reason },
      });
    } finally {
      await prisma.$disconnect();
    }
  }

  // Raw SQL because updatedAt is @updatedAt: any Prisma write resets it to now, which is
  // precisely the column the reconciler judges staleness by. The raw-sql guard scans src,
  // not test.
  async function backdateVideo(id: string, minutesAgo: number): Promise<void> {
    const prisma = new PrismaClient();
    try {
      await prisma.$executeRawUnsafe(
        `UPDATE "Video" SET "updatedAt" = NOW() - INTERVAL '${minutesAgo} minutes' WHERE "id" = $1`,
        id,
      );
    } finally {
      await prisma.$disconnect();
    }
  }

  beforeAll(async () => {
    const fixtures = await seedContentFixtures();
    contentNodeId = fixtures.g5MathsTopicId;
    chapterNodeId = fixtures.g5MathsChapterId;
    await removeIngestFixtures();

    app = await createE2eApp({
      overrideProviders: (builder) =>
        builder
          .overrideProvider(StorageService)
          .useValue(storage)
          .overrideProvider(TranscodeQueue)
          .useValue(transcodeQueue),
    });
    tokens = await loginAllRoles(app);
    teacherB = await login(app, 'teacher-b@smartteacher.dev', SEED_PASSWORD, 'demo-school-b');
    schoolAdminB = await login(app, 'admin-b@smartteacher.dev', SEED_PASSWORD, 'demo-school-b');

    const res = await get('/admin/videos', tokens[Role.SUPER_ADMIN]).expect(200);
    library = res.body.data;
  });

  afterAll(async () => {
    await removeIngestFixtures();
    await app.close();
  });

  beforeEach(() => {
    transcodeQueue.enqueue.mockClear();
    storage.objects.clear();
    storage.presignedKeys = [];
    storage.deletedKeys = [];
    storage.deletedPrefixes = [];
  });

  describe('the school-facing library', () => {
    it("lists only the videos covered by the school's entitlements", async () => {
      const res = await get('/videos', tokens[Role.TEACHER]).expect(200);

      expect(res.body.map((v: Video) => v.title)).toEqual([ENTITLED_TITLE, TEACHER_VIDEO_TITLE]);
    });

    it("gives a SCHOOL_ADMIN the school's entitled library", async () => {
      const res = await get('/videos', tokens[Role.SCHOOL_ADMIN]).expect(200);

      expect(res.body.map((v: Video) => v.title)).toEqual([ENTITLED_TITLE, TEACHER_VIDEO_TITLE]);
      expect(res.body.map((v: Video) => v.title)).not.toContain(UNENTITLED_TITLE);
    });

    it('shows a SCHOOL_ADMIN from an unentitled school an empty library', async () => {
      const res = await get('/videos', schoolAdminB).expect(200);

      expect(res.body).toEqual([]);
    });

    it('returns 404, not 403, when a SCHOOL_ADMIN requests an unentitled video', async () => {
      await get(`/videos/${idOf(UNENTITLED_TITLE)}`, tokens[Role.SCHOOL_ADMIN]).expect(404);
    });

    it('lets a teacher read an entitled video by id', async () => {
      const res = await get(`/videos/${idOf(ENTITLED_TITLE)}`, tokens[Role.TEACHER]).expect(200);

      expect(res.body.title).toBe(ENTITLED_TITLE);
    });

    // A 403 would confirm the video exists. An unentitled video must be indistinguishable
    // from one that was never created.
    it('returns 404, not 403, for a video the school holds no entitlement for', async () => {
      await get(`/videos/${idOf(UNENTITLED_TITLE)}`, tokens[Role.TEACHER]).expect(404);
    });

    it('gives a student only entitled student-audience videos', async () => {
      const res = await get('/videos', tokens[Role.STUDENT]).expect(200);

      expect(res.body.map((v: Video) => v.title)).toEqual([ENTITLED_TITLE]);
      await get(`/videos/${idOf(TEACHER_VIDEO_TITLE)}`, tokens[Role.STUDENT]).expect(404);
    });

    it('shows a school with no entitlements an empty library, not the whole platform', async () => {
      const res = await get('/videos', teacherB).expect(200);

      expect(res.body).toEqual([]);
    });

    it("404s when an unentitled school asks for another school's entitled video by id", async () => {
      await get(`/videos/${idOf(ENTITLED_TITLE)}`, teacherB).expect(404);
    });

    // The single-read path and the list path resolve their scope through the same seam,
    // so a video absent from the list can never still be readable by id.
    it('never exposes by id a video that the list omitted', async () => {
      const listed = await get('/videos', tokens[Role.TEACHER]).expect(200);
      const listedIds: string[] = listed.body.map((v: Video) => v.id);

      for (const video of library.filter((v) => !listedIds.includes(v.id))) {
        await get(`/videos/${video.id}`, tokens[Role.TEACHER]).expect(404);
      }
    });

    it('does not leak the source key or ingest state to a teacher', async () => {
      const res = await get(`/videos/${idOf(ENTITLED_TITLE)}`, tokens[Role.TEACHER]).expect(200);

      expect(res.body).not.toHaveProperty('sourceKey');
      expect(res.body).not.toHaveProperty('status');
    });
  });

  // SCHOOL_ADMIN may consume entitled content, but platform authoring remains
  // SUPER_ADMIN-only.
  describe('role boundaries', () => {
    it.each([
      ['/admin/videos'],
      ['/admin/grade-levels'],
      ['/admin/subjects'],
    ])('403s a SCHOOL_ADMIN on %s', async (path) => {
      await get(path, tokens[Role.SCHOOL_ADMIN]).expect(403);
    });

    it.each([[Role.TEACHER], [Role.STUDENT]])('403s a %s on the admin video library', async (role) => {
      await get('/admin/videos', tokens[role]).expect(403);
    });

    it('403s a SUPER_ADMIN on the school-facing library, which is not their surface', async () => {
      await get('/videos', tokens[Role.SUPER_ADMIN]).expect(403);
    });

    it.each([[Role.TEACHER], [Role.STUDENT], [Role.SCHOOL_ADMIN]])(
      '403s a %s trying to ingest a video',
      async (role) => {
        await post('/admin/videos', tokens[role]).send({}).expect(403);
      },
    );
  });

  describe('library management', () => {
    it('shows SUPER_ADMIN the whole platform library, unfiltered by any entitlement', async () => {
      expect(library.length).toBeGreaterThanOrEqual(3);
      expect(library.map((v) => v.title)).toContain(UNENTITLED_TITLE);
    });

    // Otherwise Prisma's raw foreign-key violation would surface as a 500.
    it('404s rather than 500s when a new video names a nonexistent content node', async () => {
      await post('/admin/videos', tokens[Role.SUPER_ADMIN])
        .send({
          title: `${INGEST_TITLE_PREFIX}Orphan`,
          contentNodeId: 'missing-00000000000000000000000',
          contentType: MP4,
          sizeBytes: 1024,
        })
        .expect(404);
    });

    // Videos hang off topics, not chapters. The schema's Chapter level is not
    // content-holding, so the API refuses the filing rather than trusting the UI to.
    it('409s a video filed against a level that cannot hold content', async () => {
      await post('/admin/videos', tokens[Role.SUPER_ADMIN])
        .send({
          title: `${INGEST_TITLE_PREFIX}Misfiled`,
          contentNodeId: chapterNodeId,
          contentType: MP4,
          sizeBytes: 1024,
        })
        .expect(409);
    });

    // externalId is the transcoder's to mint and sourceKey is derived from the row id —
    // neither is the caller's to choose, so both are undeclared and must be refused
    // rather than silently dropped.
    it.each([['externalId', 'sneaky-01'], ['sourceKey', 'other/source.mp4'], ['status', 'READY']])(
      'rejects a caller-supplied %s rather than silently dropping it',
      async (field, value) => {
        await post('/admin/videos', tokens[Role.SUPER_ADMIN])
          .send({
            title: `${INGEST_TITLE_PREFIX}Sneaky`,
            contentNodeId,
            contentType: MP4,
            sizeBytes: 1024,
            [field]: value,
          })
          .expect(400);
      },
    );
  });

  describe('ingest', () => {
    it('creates the record in UPLOADING and returns a presigned URL for its own key', async () => {
      const res = await post('/admin/videos', tokens[Role.SUPER_ADMIN])
        .send({
          title: `${INGEST_TITLE_PREFIX}Fractions`,
          description: 'An introduction.',
          contentNodeId,
          contentType: MP4,
          sizeBytes: 2048,
        })
        .expect(201);

      expect(res.body.video.status).toBe(VideoStatus.UPLOADING);
      expect(res.body.uploadUrl).toContain(`${res.body.video.id}/source.mp4`);
      expect(res.body.expiresInSecs).toBeGreaterThan(0);
      // The key is scoped to this video and this video only.
      expect(storage.presignedKeys).toEqual([`${res.body.video.id}/source.mp4`]);
      // Internal bucket paths are not the client's business.
      expect(res.body.video).not.toHaveProperty('sourceKey');
    });

    it.each([
      ['a non-video type', { contentType: 'text/plain' }],
      ['a file over the size cap', { sizeBytes: 5 * 1024 * 1024 * 1024 }],
      ['a zero-byte file', { sizeBytes: 0 }],
    ])('refuses to issue an upload URL for %s', async (_label, overrides) => {
      await post('/admin/videos', tokens[Role.SUPER_ADMIN])
        .send({
          title: `${INGEST_TITLE_PREFIX}Rejected`,
          contentNodeId,
          contentType: MP4,
          sizeBytes: 1024,
          ...overrides,
        })
        .expect(400);

      expect(storage.presignedKeys).toEqual([]);
    });

    it('moves an uploaded video to QUEUED and enqueues exactly one transcode job', async () => {
      const { id, sourceKey } = await createVideo('Queued');
      storage.objects.set(sourceKey, { sizeBytes: 4096, contentType: MP4 });

      const res = await post(`/admin/videos/${id}/uploaded`, tokens[Role.SUPER_ADMIN]).expect(200);

      expect(res.body.status).toBe(VideoStatus.QUEUED);
      // The verified values off the object, not the ones declared at create time.
      expect(res.body.sizeBytes).toBe(4096);
      expect(transcodeQueue.enqueue).toHaveBeenCalledTimes(1);
      // attempt 1: the fencing token the worker must echo on every callback for this run.
      expect(transcodeQueue.enqueue).toHaveBeenCalledWith({ videoId: id, sourceKey, attempt: 1 });
    });

    it('marks a video FAILED and 400s when the upload was abandoned', async () => {
      const { id } = await createVideo('Abandoned');

      // No object was ever put at the key.
      await post(`/admin/videos/${id}/uploaded`, tokens[Role.SUPER_ADMIN]).expect(400);

      const listed = await get('/admin/videos', tokens[Role.SUPER_ADMIN]).expect(200);
      const video = listed.body.data.find((v: Video) => v.id === id);
      expect(video.status).toBe(VideoStatus.FAILED);
      expect(transcodeQueue.enqueue).not.toHaveBeenCalled();
    });

    // The declared contentType is bound into the signature, but the stored object is the
    // only evidence of what actually landed.
    it('marks a video FAILED when the stored object is not a video', async () => {
      const { id, sourceKey } = await createVideo('Wrong type');
      storage.objects.set(sourceKey, { sizeBytes: 4096, contentType: 'text/plain' });

      await post(`/admin/videos/${id}/uploaded`, tokens[Role.SUPER_ADMIN]).expect(400);

      expect(transcodeQueue.enqueue).not.toHaveBeenCalled();
    });

    it('refuses a second confirmation so a transcode job is never enqueued twice', async () => {
      const { id, sourceKey } = await createVideo('Double confirm');
      storage.objects.set(sourceKey, { sizeBytes: 4096, contentType: MP4 });

      await post(`/admin/videos/${id}/uploaded`, tokens[Role.SUPER_ADMIN]).expect(200);
      await post(`/admin/videos/${id}/uploaded`, tokens[Role.SUPER_ADMIN]).expect(409);

      expect(transcodeQueue.enqueue).toHaveBeenCalledTimes(1);
    });

    it('404s when confirming a video that does not exist', async () => {
      await post('/admin/videos/missing-00000000000000000000000/uploaded', tokens[Role.SUPER_ADMIN])
        .expect(404);
    });

    it('keeps a QUEUED video out of the school-facing library entirely', async () => {
      const { id, sourceKey } = await createVideo('Not yet watchable');
      storage.objects.set(sourceKey, { sizeBytes: 4096, contentType: MP4 });
      await post(`/admin/videos/${id}/uploaded`, tokens[Role.SUPER_ADMIN]).expect(200);

      // Created against (Grade 5, Mathematics) — the pair demo-school *is* entitled to,
      // so only the status filter can be keeping it out.
      const listed = await get('/videos', tokens[Role.TEACHER]).expect(200);
      expect(listed.body.map((v: Video) => v.id)).not.toContain(id);
      await get(`/videos/${id}`, tokens[Role.TEACHER]).expect(404);
      await get(`/videos/${id}`, tokens[Role.STUDENT]).expect(404);
    });
  });

  describe('retry and delete', () => {
    it('issues a fresh URL for the same key when retrying a failed upload', async () => {
      const { id, sourceKey } = await createVideo('Retry me');
      await post(`/admin/videos/${id}/uploaded`, tokens[Role.SUPER_ADMIN]).expect(400);

      const res = await post(`/admin/videos/${id}/upload-url`, tokens[Role.SUPER_ADMIN])
        .send({ contentType: MP4, sizeBytes: 2048 })
        .expect(201);

      expect(res.body.uploadUrl).toContain(sourceKey);
      expect(res.body.video).not.toHaveProperty('sourceKey');

      // And the retried upload can then be confirmed as normal.
      storage.objects.set(sourceKey, { sizeBytes: 2048, contentType: MP4 });
      const confirmed = await post(`/admin/videos/${id}/uploaded`, tokens[Role.SUPER_ADMIN]);
      expect(confirmed.status).toBe(200);
      expect(confirmed.body.status).toBe(VideoStatus.QUEUED);
    });

    // Re-presigning live content would let an admin swap the source out from under the
    // schools entitled to it.
    it('409s when asked to re-presign a video that is already queued', async () => {
      const { id, sourceKey } = await createVideo('Already queued');
      storage.objects.set(sourceKey, { sizeBytes: 4096, contentType: MP4 });
      await post(`/admin/videos/${id}/uploaded`, tokens[Role.SUPER_ADMIN]).expect(200);

      await post(`/admin/videos/${id}/upload-url`, tokens[Role.SUPER_ADMIN])
        .send({ contentType: MP4, sizeBytes: 2048 })
        .expect(409);
    });

    // Re-uploading a 2 GB source because the *worker* died — when the source is sitting
    // intact in the bucket — is punitive, and after the reconciler fires it would be the
    // only way out.
    it('re-drives a failed transcode from the source already in the bucket', async () => {
      const { id, sourceKey } = await createVideo('Retranscode me');
      storage.objects.set(sourceKey, { sizeBytes: 4096, contentType: MP4 });
      await post(`/admin/videos/${id}/uploaded`, tokens[Role.SUPER_ADMIN]).expect(200);

      // Whatever the worker would have reported: this one failed.
      await failVideo(id);
      transcodeQueue.enqueue.mockClear();
      // Cleared here, not in beforeEach: createVideo presigns at create time, so the key
      // is already recorded before the assertion below has anything to say.
      storage.presignedKeys = [];

      const res = await post(`/admin/videos/${id}/retry`, tokens[Role.SUPER_ADMIN])
        .expect(200);

      expect(res.body.status).toBe(VideoStatus.QUEUED);
      expect(res.body.failureReason).toBeNull();
      // Attempt 2, so a stale callback from the attempt that failed is now refused.
      expect(transcodeQueue.enqueue).toHaveBeenCalledWith({ videoId: id, sourceKey, attempt: 2 });
      // No new upload URL: the point is not to re-upload the source.
      expect(storage.presignedKeys).not.toContain(sourceKey);
    });

    it('409s when re-transcoding a video that has not failed', async () => {
      const { id, sourceKey } = await createVideo('Not failed');
      storage.objects.set(sourceKey, { sizeBytes: 4096, contentType: MP4 });
      await post(`/admin/videos/${id}/uploaded`, tokens[Role.SUPER_ADMIN]).expect(200);

      await post(`/admin/videos/${id}/retry`, tokens[Role.SUPER_ADMIN]).expect(409);
    });

    // Re-enqueueing would just fail again, and the admin would learn nothing for another
    // reconciler window.
    it('409s when the source object is gone', async () => {
      const { id } = await createVideo('Source gone');
      await post(`/admin/videos/${id}/uploaded`, tokens[Role.SUPER_ADMIN]).expect(400);

      await post(`/admin/videos/${id}/retry`, tokens[Role.SUPER_ADMIN]).expect(409);
    });

    it('surfaces the failure reason to the admin library', async () => {
      const { id, sourceKey } = await createVideo('Has a reason');
      storage.objects.set(sourceKey, { sizeBytes: 4096, contentType: MP4 });
      await post(`/admin/videos/${id}/uploaded`, tokens[Role.SUPER_ADMIN]).expect(200);
      await failVideo(id, 'Unsupported codec: prores');

      const listed = await get('/admin/videos', tokens[Role.SUPER_ADMIN]).expect(200);
      const video = listed.body.data.find((v: Video) => v.id === id);

      expect(video.status).toBe(VideoStatus.FAILED);
      expect(video.failureReason).toBe('Unsupported codec: prores');
    });

    // We own reliability here — there is no provider SLA. A worker whose machine went to
    // sleep mid-job leaves a row claiming work nobody is doing, and the admin library is
    // the only place that row is ever seen, so the sweep runs on that read.
    it('sweeps a video stuck past the stale window to FAILED on the next admin read', async () => {
      const { id, sourceKey } = await createVideo('Stuck forever');
      storage.objects.set(sourceKey, { sizeBytes: 4096, contentType: MP4 });
      await post(`/admin/videos/${id}/uploaded`, tokens[Role.SUPER_ADMIN]).expect(200);

      // Comfortably past TRANSCODE_STALE_AFTER_MINS (45 in the test env).
      await backdateVideo(id, 120);

      const listed = await get('/admin/videos', tokens[Role.SUPER_ADMIN]).expect(200);
      const video = listed.body.data.find((v: Video) => v.id === id);

      expect(video.status).toBe(VideoStatus.FAILED);
      expect(video.failureReason).toBe('Transcoding did not complete in time');
    });

    it('leaves a video inside the stale window alone', async () => {
      const { id, sourceKey } = await createVideo('Still working');
      storage.objects.set(sourceKey, { sizeBytes: 4096, contentType: MP4 });
      await post(`/admin/videos/${id}/uploaded`, tokens[Role.SUPER_ADMIN]).expect(200);

      await backdateVideo(id, 5);

      const listed = await get('/admin/videos', tokens[Role.SUPER_ADMIN]).expect(200);
      expect(listed.body.data.find((v: Video) => v.id === id).status).toBe(VideoStatus.QUEUED);
    });

    it('deletes an abandoned record and its source object', async () => {
      const { id, sourceKey } = await createVideo('Delete me');
      storage.objects.set(sourceKey, { sizeBytes: 4096, contentType: MP4 });

      await del(`/admin/videos/${id}`, tokens[Role.SUPER_ADMIN]).expect(204);

      expect(storage.deletedKeys).toContain(sourceKey);
      const listed = await get('/admin/videos', tokens[Role.SUPER_ADMIN]).expect(200);
      expect(listed.body.data.map((v: Video) => v.id)).not.toContain(id);
    });

    // Deleting live content is a different decision with different consequences —
    // schools may be entitled to it — and needs its own deliberate flow.
    it('deletes a published video and both storage locations', async () => {
      const { id, sourceKey } = await createVideo('Retire ready');
      const prisma = new PrismaClient();
      await prisma.video.update({
        where: { id },
        data: {
          status: VideoStatus.READY,
          playlistKey: `videos/${id}/master.m3u8`,
          posterKey: `videos/${id}/poster.jpg`,
        },
      });
      await prisma.$disconnect();

      await del(`/admin/videos/${id}`, tokens[Role.SUPER_ADMIN]).expect(204);
      expect(storage.deletedPrefixes).toContain(`videos/${id}/`);
      expect(storage.deletedKeys).toContain(sourceKey);
    });

    it('404s when deleting a video that does not exist', async () => {
      await del('/admin/videos/missing-00000000000000000000000', tokens[Role.SUPER_ADMIN])
        .expect(404);
    });
  });
});
