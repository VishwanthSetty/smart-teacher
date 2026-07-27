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
    return NextResponse.redirect(loginRedirectUrl(request));
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
    const response = NextResponse.redirect(loginRedirectUrl(request));
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
  matcher: ['/dashboard/:path*'],
};
