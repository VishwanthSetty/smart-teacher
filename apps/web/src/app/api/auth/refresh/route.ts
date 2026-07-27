import { NextResponse } from 'next/server';
import { apiRefresh, ApiError } from '@/lib/api-client';
import { clearSessionCookies, getRefreshToken, setSessionCookies } from '@/lib/session';

export async function POST() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    return NextResponse.json({ message: 'No refresh token' }, { status: 401 });
  }

  try {
    const { accessToken, refreshToken: nextRefreshToken } = await apiRefresh(refreshToken);
    setSessionCookies(accessToken, nextRefreshToken);
    return NextResponse.json({ ok: true });
  } catch (error) {
    clearSessionCookies();
    const status = error instanceof ApiError ? error.status : 401;
    const message = error instanceof ApiError ? error.message : 'Refresh failed';
    return NextResponse.json({ message }, { status });
  }
}
