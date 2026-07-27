import { NextRequest, NextResponse } from 'next/server';
import { apiForgotPassword, ApiError } from '@/lib/api-client';

export async function POST(request: NextRequest) {
  try {
    const { email, schoolSlug } = await request.json();
    const clientIp = request.headers.get('x-forwarded-for') ?? request.ip;
    await apiForgotPassword(email, schoolSlug || undefined, clientIp ?? undefined);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const message = error instanceof ApiError ? error.message : 'Failed to request password reset';
    return NextResponse.json({ message }, { status });
  }
}
