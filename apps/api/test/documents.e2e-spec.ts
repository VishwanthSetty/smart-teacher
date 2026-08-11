import { INestApplication } from '@nestjs/common';
import { DocumentStatus, PrismaClient, Role } from '@prisma/client';
import request from 'supertest';
import { PresignedDownload, StorageService, StoredObject } from '../src/storage/storage.service';
import { createE2eApp } from './utils/e2e-app';
import {
  ENTITLED_DOCUMENT_TITLE,
  seedContentFixtures,
  TEACHER_DOCUMENT_TITLE,
  UNENTITLED_DOCUMENT_TITLE,
} from './utils/content-fixtures';
import { login, loginAllRoles, SEED_PASSWORD } from './utils/login';

const INGEST_TITLE_PREFIX = 'e2e-document-ingest ';
const PDF = 'application/pdf';

interface ListedDocument {
  id: string;
  title: string;
  status?: DocumentStatus;
}

class FakeStorage extends StorageService {
  objects = new Map<string, StoredObject>();
  presignedKeys: string[] = [];
  deletedPrefixes: string[] = [];

  async createPresignedUpload(key: string, contentType: string) {
    this.presignedKeys.push(key);
    return { url: `https://storage.test/${key}?type=${contentType}`, key, expiresInSecs: 900 };
  }

  async statObject(key: string): Promise<StoredObject | null> {
    return this.objects.get(key) ?? null;
  }

  async getObjectText(): Promise<string | null> {
    return null;
  }

  async createPresignedDownload(key: string): Promise<PresignedDownload> {
    return { url: `https://storage.test/${key}?download=1`, expiresInSecs: 300 };
  }

  async deleteObject(key: string): Promise<void> {
    this.objects.delete(key);
  }

  async deletePrefix(prefix: string): Promise<void> {
    this.deletedPrefixes.push(prefix);
  }
}

describe('Documents (e2e)', () => {
  let app: INestApplication;
  let tokens: Record<Role, string>;
  let teacherB: string;
  let contentNodeId: string;
  let chapterNodeId: string;
  let fixtureDocuments: ListedDocument[];
  const storage = new FakeStorage();

  const get = (path: string, token: string) =>
    request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${token}`);
  const post = (path: string, token: string) =>
    request(app.getHttpServer()).post(path).set('Authorization', `Bearer ${token}`);
  const del = (path: string, token: string) =>
    request(app.getHttpServer()).delete(path).set('Authorization', `Bearer ${token}`);

  const idOf = (title: string): string => {
    const document = fixtureDocuments.find((row) => row.title === title);
    if (document === undefined) throw new Error(`Fixture document "${title}" is missing`);
    return document.id;
  };

  const removeIngestFixtures = async (): Promise<void> => {
    const prisma = new PrismaClient();
    try {
      await prisma.document.deleteMany({ where: { title: { startsWith: INGEST_TITLE_PREFIX } } });
    } finally {
      await prisma.$disconnect();
    }
  };

  const createDocument = async (suffix: string): Promise<{ id: string; sourceKey: string }> => {
    const response = await post('/admin/documents', tokens[Role.SUPER_ADMIN])
      .send({
        title: `${INGEST_TITLE_PREFIX}${suffix}`,
        contentNodeId,
        contentType: PDF,
        sizeBytes: 1024,
      })
      .expect(201);
    return {
      id: response.body.document.id,
      sourceKey: `documents/${response.body.document.id}/source.pdf`,
    };
  };

  beforeAll(async () => {
    const fixtures = await seedContentFixtures();
    contentNodeId = fixtures.g5MathsTopicId;
    chapterNodeId = fixtures.g5MathsChapterId;
    await removeIngestFixtures();
    app = await createE2eApp({
      overrideProviders: (builder) => builder.overrideProvider(StorageService).useValue(storage),
    });
    tokens = await loginAllRoles(app);
    teacherB = await login(app, 'teacher-b@smartteacher.dev', SEED_PASSWORD, 'demo-school-b');
    const response = await get('/admin/documents', tokens[Role.SUPER_ADMIN]).expect(200);
    fixtureDocuments = response.body.data;
  });

  afterAll(async () => {
    await removeIngestFixtures();
    await app.close();
  });

  beforeEach(() => {
    storage.objects.clear();
    storage.presignedKeys = [];
    storage.deletedPrefixes = [];
  });

  describe('school-facing access', () => {
    it('shows both entitled audiences to an unassigned teacher', async () => {
      const response = await get('/documents', tokens[Role.TEACHER]).expect(200);
      expect(response.body.map((row: ListedDocument) => row.title)).toEqual(
        expect.arrayContaining([ENTITLED_DOCUMENT_TITLE, TEACHER_DOCUMENT_TITLE]),
      );
      expect(response.body).toHaveLength(2);
    });

    it('never exposes teacher material to a student', async () => {
      const response = await get('/documents', tokens[Role.STUDENT]).expect(200);
      expect(response.body.map((row: ListedDocument) => row.title)).toEqual([
        ENTITLED_DOCUMENT_TITLE,
      ]);
      await get(`/documents/${idOf(TEACHER_DOCUMENT_TITLE)}`, tokens[Role.STUDENT]).expect(404);
      await get(`/documents/${idOf(TEACHER_DOCUMENT_TITLE)}/download`, tokens[Role.STUDENT]).expect(404);
    });

    it('returns 404 for an unentitled document and an empty list for an unentitled school', async () => {
      await get(`/documents/${idOf(UNENTITLED_DOCUMENT_TITLE)}`, tokens[Role.TEACHER]).expect(404);
      const response = await get('/documents', teacherB).expect(200);
      expect(response.body).toEqual([]);
    });

    it('returns a short-lived download as JSON with a safe file name', async () => {
      const response = await get(
        `/documents/${idOf(ENTITLED_DOCUMENT_TITLE)}/download`,
        tokens[Role.TEACHER],
      ).expect(200);
      expect(response.body).toMatchObject({ expiresInSecs: 300 });
      expect(response.body.url).toContain('download=1');
      expect(response.body.fileName).toBe('Grade-5-Maths-Fraction-Worksheet.pdf');
    });
  });

  describe('ingest lifecycle', () => {
    it('creates a namespaced upload and verifies the stored object before READY', async () => {
      const { id, sourceKey } = await createDocument('ready');
      expect(storage.presignedKeys).toEqual([sourceKey]);
      storage.objects.set(sourceKey, { sizeBytes: 4096, contentType: PDF });

      const response = await post(`/admin/documents/${id}/uploaded`, tokens[Role.SUPER_ADMIN])
        .expect(200);
      expect(response.body).toMatchObject({ status: DocumentStatus.READY, sizeBytes: 4096 });
      await post(`/admin/documents/${id}/uploaded`, tokens[Role.SUPER_ADMIN]).expect(409);
      await post(`/admin/documents/${id}/upload-url`, tokens[Role.SUPER_ADMIN])
        .send({ contentType: PDF, sizeBytes: 4096 })
        .expect(409);
    });

    it('persists FAILED before rejecting an abandoned upload, then permits repair', async () => {
      const { id, sourceKey } = await createDocument('repair');
      await post(`/admin/documents/${id}/uploaded`, tokens[Role.SUPER_ADMIN]).expect(400);
      const failed = await get(`/admin/documents/${id}`, tokens[Role.SUPER_ADMIN]).expect(200);
      expect(failed.body.status).toBe(DocumentStatus.FAILED);
      expect(failed.body.failureReason).toBeTruthy();

      await post(`/admin/documents/${id}/upload-url`, tokens[Role.SUPER_ADMIN])
        .send({ contentType: PDF, sizeBytes: 2048 })
        .expect(201);
      storage.objects.set(sourceKey, { sizeBytes: 2048, contentType: PDF });
      await post(`/admin/documents/${id}/uploaded`, tokens[Role.SUPER_ADMIN]).expect(200);
    });

    it('rejects a non-content-holding node and caller-supplied lifecycle state', async () => {
      await post('/admin/documents', tokens[Role.SUPER_ADMIN])
        .send({
          title: `${INGEST_TITLE_PREFIX}misfiled`,
          contentNodeId: chapterNodeId,
          contentType: PDF,
          sizeBytes: 1024,
        })
        .expect(409);
      await post('/admin/documents', tokens[Role.SUPER_ADMIN])
        .send({
          title: `${INGEST_TITLE_PREFIX}sneaky`,
          contentNodeId,
          contentType: PDF,
          sizeBytes: 1024,
          status: DocumentStatus.READY,
        })
        .expect(400);
    });

    it('deletes the row before best-effort namespaced storage cleanup', async () => {
      const { id } = await createDocument('delete');
      await del(`/admin/documents/${id}`, tokens[Role.SUPER_ADMIN]).expect(204);
      expect(storage.deletedPrefixes).toContain(`documents/${id}/`);
      await get(`/admin/documents/${id}`, tokens[Role.SUPER_ADMIN]).expect(404);
    });
  });

  it.each([[Role.SCHOOL_ADMIN], [Role.TEACHER], [Role.STUDENT]])(
    '403s a %s attempting to author a document',
    async (role) => {
      await post('/admin/documents', tokens[role]).send({}).expect(403);
    },
  );
});
