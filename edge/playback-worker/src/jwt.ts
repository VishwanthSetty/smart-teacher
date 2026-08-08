export interface PlaybackClaims {
  iss: string;
  aud: string | string[];
  sub: string;
  vid: string;
  pfx: string;
  iat: number;
  exp: number;
}

interface JwtHeader { alg: string; kid?: string }
interface JwkSet { keys: JsonWebKey[] }
interface PlaybackJwk extends JsonWebKey { kid?: string }

const keyCache = new Map<string, Promise<CryptoKey>>();

function decodeJson<T>(value: string): T {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

function decodeBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

function selectJwk(serialized: string, kid?: string): JsonWebKey {
  const parsed = JSON.parse(serialized) as JsonWebKey | JwkSet;
  const keys = ('keys' in parsed ? parsed.keys : [parsed]) as PlaybackJwk[];
  const key = keys.find((candidate) => candidate.kid === kid);
  if (key === undefined || key.kty !== 'EC' || key.crv !== 'P-256' || key.alg !== 'ES256') {
    throw new Error('Unknown playback signing key');
  }
  return key;
}

async function verificationKey(serialized: string, kid?: string): Promise<CryptoKey> {
  const cacheKey = `${serialized}:${kid ?? ''}`;
  let imported = keyCache.get(cacheKey);
  if (imported === undefined) {
    imported = crypto.subtle.importKey(
      'jwk',
      selectJwk(serialized, kid),
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
    keyCache.set(cacheKey, imported);
  }
  return imported;
}

export async function verifyPlaybackJwt(
  token: string,
  publicJwk: string,
  issuer: string,
  audience: string,
  nowSecs = Math.floor(Date.now() / 1000),
): Promise<PlaybackClaims> {
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some((part) => part.length === 0)) throw new Error('Malformed token');
  const header = decodeJson<JwtHeader>(parts[0]);
  if (header.alg !== 'ES256') throw new Error('Unsupported algorithm');
  const key = await verificationKey(publicJwk, header.kid);
  const valid = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    decodeBytes(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
  );
  if (!valid) throw new Error('Invalid signature');
  const claims = decodeJson<PlaybackClaims>(parts[1]);
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (
    claims.iss !== issuer || !audiences.includes(audience) ||
    !Number.isInteger(claims.exp) || claims.exp <= nowSecs ||
    !Number.isInteger(claims.iat) || typeof claims.sub !== 'string' ||
    typeof claims.vid !== 'string' || typeof claims.pfx !== 'string'
  ) throw new Error('Invalid claims');
  return claims;
}
