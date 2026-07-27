import { NextResponse } from 'next/server';
import { apiLogout } from '@/lib/api-client';
import { clearSessionCookies, getAccessToken, getRefreshToken } from '@/lib/session';

export async function POST() {
  const accessToken = getAccessToken();
  const refreshToken = getRefreshToken();

  if (accessToken) {
    await apiLogout(accessToken, refreshToken).catch(() => undefined);
  }

  clearSessionCookies();
  return NextResponse.json({ ok: true });
}
