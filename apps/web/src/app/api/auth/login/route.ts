import { NextRequest, NextResponse } from 'next/server';
import { apiLogin, ApiError } from '@/lib/api-client';
import { setSessionCookies } from '@/lib/session';

export async function POST(request: NextRequest) {
  try {
    const { email, password, schoolSlug } = await request.json();
    const { accessToken, refreshToken } = await apiLogin(email, password, schoolSlug || undefined);
    setSessionCookies(accessToken, refreshToken);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const message = error instanceof ApiError ? error.message : 'Login failed';
    return NextResponse.json({ message }, { status });
  }
}
