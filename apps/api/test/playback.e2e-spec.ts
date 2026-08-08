import { INestApplication } from '@nestjs/common';
import { PrismaClient, Role } from '@prisma/client';
import request from 'supertest';
import { PresignedDownload, PresignedUpload, StorageService, StoredObject } from '../src/storage/storage.service';
import { ENTITLED_VIDEO_TITLE, SCIENCE_VIDEO_TITLE, UNENTITLED_VIDEO_TITLE, seedContentFixtures } from './utils/content-fixtures';
import { createE2eApp } from './utils/e2e-app';
import { login, loginAllRoles, SEED_PASSWORD } from './utils/login';

class PlaybackStorage extends StorageService {
  texts = new Map<string, string>();
  downloadKeys: string[] = [];
  async createPresignedUpload(key: string): Promise<PresignedUpload> { return { url: 'https://storage.test/upload', key, expiresInSecs: 900 }; }
  async statObject(): Promise<StoredObject | null> { return null; }
  async getObjectText(key: string): Promise<string | null> { return this.texts.get(key) ?? null; }
  async createPresignedDownload(key: string): Promise<PresignedDownload> { this.downloadKeys.push(key); return { url: `https://storage.test/${key}`, expiresInSecs: 300 }; }
  async deleteObject(): Promise<void> {}
  async deletePrefix(): Promise<void> {}
}

describe('Playback (e2e)', () => {
  let app: INestApplication;
  let tokens: Record<Role, string>;
  let teacherB: string;
  let schoolAdminB: string;
  let entitledId: string;
  let scienceId: string;
  let wrongGradeId: string;
  const storage = new PlaybackStorage();

  beforeAll(async () => {
    await seedContentFixtures();
    const prisma = new PrismaClient();
    const videos = await prisma.video.findMany({ where: { title: { in: [ENTITLED_VIDEO_TITLE, SCIENCE_VIDEO_TITLE, UNENTITLED_VIDEO_TITLE] } }, select: { id: true, title: true } });
    await prisma.$disconnect();
    const entitled = videos.find(({ title }) => title === ENTITLED_VIDEO_TITLE);
    const science = videos.find(({ title }) => title === SCIENCE_VIDEO_TITLE);
    const wrongGrade = videos.find(({ title }) => title === UNENTITLED_VIDEO_TITLE);
    if (!entitled || !science || !wrongGrade) throw new Error('Playback fixtures missing');
    entitledId = entitled.id; scienceId = science.id; wrongGradeId = wrongGrade.id;
    for (const id of [entitledId, scienceId]) {
      storage.texts.set(`videos/${id}/master.m3u8`, '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=800000\n360p/playlist.m3u8\n');
      storage.texts.set(`videos/${id}/360p/playlist.m3u8`, '#EXTM3U\n#EXTINF:6,\nsegment_000.ts\n');
    }
    app = await createE2eApp({ overrideProviders: (builder) => builder.overrideProvider(StorageService).useValue(storage) });
    tokens = await loginAllRoles(app);
    teacherB = await login(app, 'teacher-b@smartteacher.dev', SEED_PASSWORD, 'demo-school-b');
    schoolAdminB = await login(app, 'admin-b@smartteacher.dev', SEED_PASSWORD, 'demo-school-b');
  });

  afterAll(async () => { await app.close(); });
  beforeEach(() => { storage.downloadKeys = []; });

  const getPlaybackToken = (id: string, token: string) => request(app.getHttpServer()).get(`/videos/${id}/playback-token`).set('Authorization', `Bearer ${token}`);
  const localPath = (absoluteUrl: string) => {
    const url = new URL(absoluteUrl);
    return `${url.pathname}${url.search}`;
  };

  it('checks the entitled grade-and-subject pair for students and unentitled schools', async () => {
    await getPlaybackToken(scienceId, tokens[Role.STUDENT]).expect(404);
    await getPlaybackToken(wrongGradeId, tokens[Role.STUDENT]).expect(404);
    await getPlaybackToken(entitledId, teacherB).expect(404);
  });

  it('mints for an entitled SCHOOL_ADMIN and hides the video from an unentitled admin', async () => {
    await getPlaybackToken(entitledId, tokens[Role.SCHOOL_ADMIN]).expect(200);
    await getPlaybackToken(entitledId, schoolAdminB).expect(404);
  });

  it('mints for SUPER_ADMIN through the same route and rewrites a tokenized master', async () => {
    const ticket = await getPlaybackToken(entitledId, tokens[Role.SUPER_ADMIN]).expect(200);
    expect(ticket.body.manifestUrl).toMatch(/^http:\/\//);
    const master = await request(app.getHttpServer()).get(localPath(ticket.body.manifestUrl)).expect(200);
    expect(master.text).toContain('360p/playlist.m3u8?t=');
    expect(master.text).not.toContain('videos/');
    expect(master.text).not.toContain('ingest-bucket');
  });

  it('refuses a video-A token on video B and never presigns storage', async () => {
    const ticket = await getPlaybackToken(entitledId, tokens[Role.STUDENT]).expect(200);
    await request(app.getHttpServer()).get(localPath(ticket.body.manifestUrl)).expect(200);
    await request(app.getHttpServer()).get(localPath(ticket.body.manifestUrl.replace(entitledId, scienceId))).expect(401);
    expect(storage.downloadKeys).toEqual([]);
  });

  it('serves the literal variant route and presigns only a validated segment key', async () => {
    const ticket = await getPlaybackToken(entitledId, tokens[Role.STUDENT]).expect(200);
    const token = new URL(ticket.body.manifestUrl).searchParams.get('t');
    if (!token) throw new Error('Playback token missing');
    const variant = await request(app.getHttpServer()).get(`/videos/${entitledId}/hls/360p/playlist.m3u8?t=${encodeURIComponent(token)}`).expect(200);
    expect(variant.text).toContain('segment_000.ts?t=');
    await request(app.getHttpServer()).get(`/videos/${entitledId}/hls/360p/segment_000.ts?t=${encodeURIComponent(token)}`).expect(302);
    expect(storage.downloadKeys).toEqual([`videos/${entitledId}/360p/segment_000.ts`]);
    storage.downloadKeys = [];
    await request(app.getHttpServer()).get(`/videos/${entitledId}/hls/360p/..%2Fsecret.ts?t=${encodeURIComponent(token)}`).expect(400);
    expect(storage.downloadKeys).toEqual([]);
  });
});
