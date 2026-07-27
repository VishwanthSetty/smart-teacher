import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { AuthUser } from '@smart-teacher/shared-types';
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE, REFRESH_TOKEN_MAX_AGE_SECONDS } from './cookies';
import { apiGetMe } from './api-client';
import { toSafeRedirect } from './safe-redirect';

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: REFRESH_TOKEN_MAX_AGE_SECONDS,
};

export function setSessionCookies(accessToken: string, refreshToken: string) {
  const cookieStore = cookies();
  cookieStore.set(ACCESS_TOKEN_COOKIE, accessToken, cookieOptions);
  cookieStore.set(REFRESH_TOKEN_COOKIE, refreshToken, cookieOptions);
}

export function clearSessionCookies() {
  const cookieStore = cookies();
  cookieStore.delete(ACCESS_TOKEN_COOKIE);
  cookieStore.delete(REFRESH_TOKEN_COOKIE);
}

export function getAccessToken(): string | undefined {
  return cookies().get(ACCESS_TOKEN_COOKIE)?.value;
}

export function getRefreshToken(): string | undefined {
  return cookies().get(REFRESH_TOKEN_COOKIE)?.value;
}

// cache() dedupes this for the whole render pass, so the dashboard layout and the page
// nested inside it share one /users/me round-trip instead of making two.
export const getCurrentUser = cache(async (): Promise<AuthUser | null> => {
  const accessToken = getAccessToken();
  if (!accessToken) {
    return null;
  }
  return apiGetMe(accessToken).catch(() => null);
});

// Middleware runs first on every /dashboard/* request and attaches ?next= for the common
// case (missing or expired token). This covers the narrower case of a token that is
// present but rejected by the API (revoked session, disabled account) — middleware's
// x-pathname header is the only way to recover the intended destination at this point.
export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) {
    const pathname = headers().get('x-pathname');
    const next = pathname ? toSafeRedirect(pathname) : null;
    redirect(next ? `/login?next=${encodeURIComponent(next)}` : '/login');
  }
  return user;
}
