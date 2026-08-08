import { beforeAll, describe, expect, it } from 'vitest';
import worker, { Env } from '../src/index';

let privateKey: CryptoKey;
let publicJwk: string;

function base64url(value: string | ArrayBuffer): string {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function token(overrides: Record<string, unknown> = {}, algorithm = 'ES256'): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: algorithm, kid: 'test-1', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    iss: 'smart-teacher-api', aud: 'smart-teacher-playback', sub: 'user-1',
    vid: 'video-a', pfx: 'videos/video-a/', iat: now, exp: now + 600, ...overrides,
  }));
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' }, privateKey, new TextEncoder().encode(`${header}.${payload}`),
  );
  return `${header}.${payload}.${base64url(signature)}`;
}

function object(body: string, range?: { offset: number; length: number }): R2ObjectBody {
  const bytes = new TextEncoder().encode(body);
  return {
    key: 'fixture', version: '1', size: bytes.length, etag: 'etag', httpEtag: '"etag"',
    uploaded: new Date(), checksums: {} as R2Checksums, customMetadata: {}, range,
    body: new Blob([bytes.slice(range?.offset ?? 0, range ? range.offset + range.length : undefined)]).stream(),
    bodyUsed: false,
    arrayBuffer: async () => bytes.buffer,
    bytes: async () => bytes,
    text: async () => body,
    json: async () => JSON.parse(body) as unknown,
    blob: async () => new Blob([bytes]),
    writeHttpMetadata: (headers) => headers.set('Content-Type', 'video/mp2t'),
  } as R2ObjectBody;
}

function env(contents: Record<string, string> = {}): Env {
  const media = {
    get: async (key: string, options?: R2GetOptions) => {
      const body = contents[key];
      if (body === undefined) return null;
      const rangeHeader = options && 'range' in options && options.range instanceof Headers
        ? options.range.get('Range') : null;
      const match = rangeHeader ? /^bytes=(\d+)-(\d+)$/.exec(rangeHeader) : null;
      return object(body, match ? { offset: Number(match[1]), length: Number(match[2]) - Number(match[1]) + 1 } : undefined);
    },
  } as unknown as R2Bucket;
  return {
    MEDIA: media, PLAYBACK_PUBLIC_JWK: publicJwk,
    PLAYBACK_ISSUER: 'smart-teacher-api', PLAYBACK_AUDIENCE: 'smart-teacher-playback',
    ALLOWED_ORIGINS: 'https://app.example.com,http://localhost:3000',
  };
}

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  privateKey = pair.privateKey;
  const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  publicJwk = JSON.stringify({ ...jwk, kid: 'test-1', alg: 'ES256', use: 'sig' });
});

describe('playback worker', () => {
  it('rejects expired, tampered, wrong-audience, and forged-alg tokens', async () => {
    const valid = await token();
    const candidates = [
      await token({ exp: Math.floor(Date.now() / 1000) - 1 }),
      `${valid.slice(0, -1)}x`,
      await token({ aud: 'other' }),
      await token({}, 'HS256'),
    ];
    for (const candidate of candidates) {
      const result = await worker.fetch(new Request(`https://videos.example.com/videos/video-a/master.m3u8?t=${candidate}`), env());
      expect(result.status).toBe(403);
    }
  });

  it('enforces pfx before reading an otherwise valid key', async () => {
    const result = await worker.fetch(
      new Request(`https://videos.example.com/videos/video-b/master.m3u8?t=${await token()}`),
      env({ 'videos/video-b/master.m3u8': '#EXTM3U\n' }),
    );
    expect(result.status).toBe(403);
  });

  it('rewrites manifests with the same token', async () => {
    const jwt = await token();
    const result = await worker.fetch(
      new Request(`https://videos.example.com/videos/video-a/master.m3u8?t=${jwt}`),
      env({ 'videos/video-a/master.m3u8': '#EXTM3U\n360p/playlist.m3u8\n' }),
    );
    expect(result.status).toBe(200);
    expect(await result.text()).toContain(`360p/playlist.m3u8?t=${encodeURIComponent(jwt)}`);
    expect(result.headers.get('Cache-Control')).toBe('no-store');
  });

  it('passes byte ranges to R2 and returns 206 metadata', async () => {
    const result = await worker.fetch(new Request(
      `https://videos.example.com/videos/video-a/360p/segment_001.ts?t=${await token()}`,
      { headers: { Range: 'bytes=2-5', Origin: 'https://app.example.com' } },
    ), env({ 'videos/video-a/360p/segment_001.ts': '0123456789' }));
    expect(result.status).toBe(206);
    expect(result.headers.get('Content-Range')).toBe('bytes 2-5/10');
    expect(result.headers.get('Access-Control-Allow-Origin')).toBe('https://app.example.com');
    expect(result.headers.get('Vary')).toBe('Origin');
  });

  it('answers preflight and withholds ACAO from unknown origins', async () => {
    const preflight = await worker.fetch(new Request('https://videos.example.com/videos/x/master.m3u8', {
      method: 'OPTIONS', headers: { Origin: 'https://app.example.com', 'Access-Control-Request-Headers': 'Range' },
    }), env());
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('Access-Control-Allow-Headers')).toBe('Range');
    const denied = await worker.fetch(new Request('https://videos.example.com/videos/x/master.m3u8', {
      method: 'OPTIONS', headers: { Origin: 'https://evil.example' },
    }), env());
    expect(denied.headers.has('Access-Control-Allow-Origin')).toBe(false);
  });
});
