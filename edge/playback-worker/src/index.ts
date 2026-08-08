import { corsHeaders, withCors } from './cors';
import { rewriteHlsManifest } from './hls-rewrite';
import { verifyPlaybackJwt } from './jwt';
import { playbackKey } from './keys';

export interface Env {
  MEDIA: R2Bucket;
  PLAYBACK_PUBLIC_JWK: string;
  PLAYBACK_ISSUER: string;
  PLAYBACK_AUDIENCE: string;
  ALLOWED_ORIGINS: string;
}

function response(status: number, message: string): Response {
  return new Response(message, { status });
}

async function handle(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request, env.ALLOWED_ORIGINS) });
  if (request.method !== 'GET' && request.method !== 'HEAD') return response(405, 'Method Not Allowed');

  const url = new URL(request.url);
  const token = url.searchParams.get('t');
  if (token === null) return response(403, 'Forbidden');

  let claims;
  try {
    claims = await verifyPlaybackJwt(token, env.PLAYBACK_PUBLIC_JWK, env.PLAYBACK_ISSUER, env.PLAYBACK_AUDIENCE);
  } catch {
    return response(403, 'Forbidden');
  }

  const media = playbackKey(url.pathname);
  if (media === null) return response(404, 'Not Found');
  if (!media.key.startsWith(claims.pfx)) return response(403, 'Forbidden');

  if (media.manifest) {
    const object = await env.MEDIA.get(media.key);
    if (object === null) return response(404, 'Not Found');
    const manifest = rewriteHlsManifest(await object.text(), (uri) => `${uri}?t=${encodeURIComponent(token)}`);
    return new Response(request.method === 'HEAD' ? null : manifest, {
      headers: { 'Content-Type': 'application/vnd.apple.mpegurl', 'Cache-Control': 'no-store' },
    });
  }

  const range = request.headers.get('Range');
  const object = await env.MEDIA.get(media.key, range === null ? undefined : { range: request.headers });
  if (object === null) return response(404, 'Not Found');
  const headers = new Headers({
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, max-age=600',
    ETag: object.httpEtag,
  });
  object.writeHttpMetadata(headers);
  let status = 200;
  if (range !== null && object.range !== undefined) {
    status = 206;
    const served = object.range;
    const offset = 'suffix' in served ? object.size - served.suffix : served.offset ?? 0;
    const length = 'suffix' in served ? served.suffix : served.length ?? object.size - offset;
    headers.set('Content-Range', `bytes ${offset}-${offset + length - 1}/${object.size}`);
    headers.set('Content-Length', String(length));
  } else {
    headers.set('Content-Length', String(object.size));
  }
  return new Response(request.method === 'HEAD' ? null : object.body, { status, headers });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return withCors(await handle(request, env), request, env.ALLOWED_ORIGINS);
  },
};
