import { NextRequest, NextResponse } from 'next/server';
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE, REFRESH_TOKEN_MAX_AGE_SECONDS } from '@/lib/cookies';
import { getJwtExpiry } from '@/lib/jwt';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';
const REFRESH_MARGIN_MS = 30_000;

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: REFRESH_TOKEN_MAX_AGE_SECONDS,
};

// Carries the page the user actually asked for through the login hop, so they land back
// on it instead of always being dumped on /dashboard. The login page validates this
// value before using it — see lib/safe-redirect.ts.
function loginRedirectUrl(request: NextRequest): URL {
  const url = new URL('/login', request.url);
  url.searchParams.set('next', `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return url;
}

// An XHR from the player cannot follow a 302 to /login — it would parse the HTML login page as
// JSON. API routes get the same { message } 401 shape every BFF handler already returns.
function unauthenticated(request: NextRequest): NextResponse {
  if (request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
  }
  return NextResponse.redirect(loginRedirectUrl(request));
}

// Stamped on every pass-through so requireUser() can still build a `?next=` redirect if
// the API later rejects the token (revoked session, disabled account) — that check
// happens in a server component, past the point where a redirect can read the URL.
function withPathnameHeader(request: NextRequest): Headers {
  const headers = new Headers(request.headers);
  headers.set('x-pathname', `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return headers;
}

export async function middleware(request: NextRequest) {
  const refreshToken = request.cookies.get(REFRESH_TOKEN_COOKIE)?.value;
  if (!refreshToken) {
    return unauthenticated(request);
  }

  const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  const expiresAt = accessToken ? getJwtExpiry(accessToken) : null;
  if (expiresAt && expiresAt - Date.now() > REFRESH_MARGIN_MS) {
    return NextResponse.next({ request: { headers: withPathnameHeader(request) } });
  }

  const refreshed = await fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${refreshToken}` },
    cache: 'no-store',
  });

  if (!refreshed.ok) {
    const response = unauthenticated(request);
    response.cookies.delete(ACCESS_TOKEN_COOKIE);
    response.cookies.delete(REFRESH_TOKEN_COOKIE);
    return response;
  }

  const tokens = (await refreshed.json()) as { accessToken: string; refreshToken: string };

  // Set on the incoming request too, so this same pass's server components see
  // the fresh token — the response cookies below only reach the browser's next request.
  request.cookies.set(ACCESS_TOKEN_COOKIE, tokens.accessToken);
  request.cookies.set(REFRESH_TOKEN_COOKIE, tokens.refreshToken);

  const response = NextResponse.next({ request: { headers: withPathnameHeader(request) } });
  response.cookies.set(ACCESS_TOKEN_COOKIE, tokens.accessToken, cookieOptions);
  response.cookies.set(REFRESH_TOKEN_COOKIE, tokens.refreshToken, cookieOptions);
  return response;
}

export const config = {
  // The player re-mints a playback token mid-video from /api/videos/:id/playback-token. Without
  // this second entry that call reads a stale access-token cookie once the ~15m access token
  // expires, the API 401s, and a long video dies with no way back short of a page reload.
  matcher: ['/dashboard/:path*', '/api/videos/:path*'],
};
