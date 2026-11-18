import { INestApplication } from '@nestjs/common';
import { DocumentStatus, PrismaClient, Role, VideoStatus } from '@prisma/client';
import request from 'supertest';
import { PresignedDownload, StorageService, StoredObject } from '../src/storage/storage.service';
import { TranscodeJob, TranscodeQueue } from '../src/transcoding/transcode-queue';
import { createE2eApp } from './utils/e2e-app';
import { seedContentFixtures } from './utils/content-fixtures';
import { loginAllRoles } from './utils/login';

const TITLE_PREFIX = 'e2e-bulk-content ';
const MP4 = 'video/mp4';
const PDF = 'application/pdf';

class FakeStorage extends StorageService {
  objects = new Map<string, StoredObject>();

  async createPresignedUpload(key: string, contentType: string) {
    return { url: `https://storage.test/${key}?type=${contentType}`, key, expiresInSecs: 900 };
  }

  async statObject(key: string): Promise<StoredObject | null> {
    return this.objects.get(key) ?? null;
  }

  async getObjectText(): Promise<string | null> {
    return null;
  }

  async createPresignedDownload(key: string): Promise<PresignedDownload> {
    return { url: `https://storage.test/${key}`, expiresInSecs: 300 };
  }

  async deleteObject(key: string): Promise<void> {
    this.objects.delete(key);
  }

  async deletePrefix(): Promise<void> {
    return undefined;
  }
}

class FakeTranscodeQueue extends TranscodeQueue {
  jobs: TranscodeJob[] = [];

  async enqueue(job: TranscodeJob): Promise<void> {
    this.jobs.push(job);
  }
}

describe('Bulk content upload (e2e)', () => {
  let app: INestApplication;
  let tokens: Record<Role, string>;
  let contentNodeId: string;
  let chapterNodeId: string;
  const storage = new FakeStorage();
  const transcodeQueue = new FakeTranscodeQueue();
  const prisma = new PrismaClient();

  const post = (path: string, token: string) =>
    request(app.getHttpServer()).post(path).set('Authorization', `Bearer ${token}`);

  const removeFixtures = async (): Promise<void> => {
    const where = { title: { startsWith: TITLE_PREFIX } };
    await prisma.video.deleteMany({ where });
    await prisma.document.deleteMany({ where });
  };

  beforeAll(async () => {
    const fixtures = await seedContentFixtures();
    contentNodeId = fixtures.g5MathsTopicId;
    chapterNodeId = fixtures.g5MathsChapterId;
    await removeFixtures();
    app = await createE2eApp({
      overrideProviders: (builder) =>
        builder
          .overrideProvider(StorageService)
          .useValue(storage)
          .overrideProvider(TranscodeQueue)
          .useValue(transcodeQueue),
    });
    tokens = await loginAllRoles(app);
  });

  afterAll(async () => {
    await removeFixtures();
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(() => {
    storage.objects.clear();
    transcodeQueue.jobs = [];
  });

  it('creates and confirms a mixed batch of videos and documents', async () => {
    const created = await post('/admin/content/bulk', tokens[Role.SUPER_ADMIN])
      .send({
        items: [
          { kind: 'VIDEO', title: `${TITLE_PREFIX}video`, contentNodeId, contentType: MP4, sizeBytes: 2048 },
          { kind: 'DOCUMENT', title: `${TITLE_PREFIX}pdf`, contentNodeId, contentType: PDF, sizeBytes: 1024 },
        ],
      })
      .expect(200);

    expect(created.body.createdCount).toBe(2);
    const [videoItem, documentItem] = created.body.items;
    expect(videoItem.uploadUrl).toContain(`/${videoItem.id}/`);
    expect(documentItem.uploadUrl).toContain(`documents/${documentItem.id}/`);

    const video = await prisma.video.findUniqueOrThrow({ where: { id: videoItem.id } });
    const document = await prisma.document.findUniqueOrThrow({ where: { id: documentItem.id } });
    expect(video.status).toBe(VideoStatus.UPLOADING);
    expect(document.status).toBe(DocumentStatus.UPLOADING);

    storage.objects.set(video.sourceKey ?? '', { sizeBytes: 2048, contentType: MP4 });
    storage.objects.set(document.sourceKey ?? '', { sizeBytes: 1024, contentType: PDF });

    const confirmed = await post('/admin/content/bulk/confirm', tokens[Role.SUPER_ADMIN])
      .send({
        items: [
          { kind: 'VIDEO', id: videoItem.id },
          { kind: 'DOCUMENT', id: documentItem.id },
        ],
      })
      .expect(200);

    expect(confirmed.body.confirmedCount).toBe(2);
    expect(confirmed.body.items.map((item: { status: string }) => item.status)).toEqual([
      VideoStatus.QUEUED,
      DocumentStatus.READY,
    ]);
    expect(transcodeQueue.jobs.map((job) => job.videoId)).toEqual([videoItem.id]);
  });

  it('reports a refused item without losing the valid ones in the batch', async () => {
    const created = await post('/admin/content/bulk', tokens[Role.SUPER_ADMIN])
      .send({
        items: [
          // A chapter cannot hold content, so the single-item ingest rule still applies here.
          { kind: 'VIDEO', title: `${TITLE_PREFIX}chapter`, contentNodeId: chapterNodeId, contentType: MP4, sizeBytes: 10 },
          { kind: 'DOCUMENT', title: `${TITLE_PREFIX}wrong type`, contentNodeId, contentType: MP4, sizeBytes: 10 },
          { kind: 'VIDEO', title: `${TITLE_PREFIX}missing node`, contentNodeId: 'missing', contentType: MP4, sizeBytes: 10 },
          { kind: 'DOCUMENT', title: `${TITLE_PREFIX}valid`, contentNodeId, contentType: PDF, sizeBytes: 10 },
        ],
      })
      .expect(200);

    expect(created.body).toMatchObject({ createdCount: 1, failedCount: 3 });
    expect(created.body.items.map((item: { ok: boolean }) => item.ok)).toEqual([
      false,
      false,
      false,
      true,
    ]);
    expect(
      await prisma.video.count({ where: { title: `${TITLE_PREFIX}chapter` } }),
    ).toBe(0);
  });

  it('marks an item failed when its file never reached storage', async () => {
    const created = await post('/admin/content/bulk', tokens[Role.SUPER_ADMIN])
      .send({
        items: [
          { kind: 'DOCUMENT', title: `${TITLE_PREFIX}abandoned`, contentNodeId, contentType: PDF, sizeBytes: 10 },
        ],
      })
      .expect(200);
    const { id } = created.body.items[0];

    const confirmed = await post('/admin/content/bulk/confirm', tokens[Role.SUPER_ADMIN])
      .send({ items: [{ kind: 'DOCUMENT', id }] })
      .expect(200);

    expect(confirmed.body).toMatchObject({ confirmedCount: 0, failedCount: 1 });
    expect(confirmed.body.items[0].error).toBe('No file was uploaded for this document');
    const document = await prisma.document.findUniqueOrThrow({ where: { id } });
    expect(document.status).toBe(DocumentStatus.FAILED);
  });

  it('refuses an oversized batch outright', async () => {
    const items = Array.from({ length: 51 }, (_, index) => ({
      kind: 'DOCUMENT',
      title: `${TITLE_PREFIX}${index}`,
      contentNodeId,
      contentType: PDF,
      sizeBytes: 10,
    }));

    await post('/admin/content/bulk', tokens[Role.SUPER_ADMIN]).send({ items }).expect(400);
    expect(await prisma.document.count({ where: { title: `${TITLE_PREFIX}0` } })).toBe(0);
  });

  it('refuses a field the contract does not declare', async () => {
    await post('/admin/content/bulk', tokens[Role.SUPER_ADMIN])
      .send({
        items: [
          { kind: 'DOCUMENT', title: `${TITLE_PREFIX}extra`, contentNodeId, contentType: PDF, sizeBytes: 10, sourceKey: 'x' },
        ],
      })
      .expect(400);
  });
});
