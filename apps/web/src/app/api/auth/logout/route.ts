import { NextResponse } from 'next/server';
import { apiLogout } from '@/lib/api-client';
import { clearSessionCookies, getAccessToken } from '@/lib/session';

export async function POST() {
  const accessToken = getAccessToken();

  if (accessToken) {
    await apiLogout(accessToken).catch(() => undefined);
  }

  clearSessionCookies();
  return NextResponse.json({ ok: true });
}
