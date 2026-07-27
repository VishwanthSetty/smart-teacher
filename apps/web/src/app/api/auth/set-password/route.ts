import { NextRequest, NextResponse } from 'next/server';
import { apiSetPassword, ApiError } from '@/lib/api-client';

export async function POST(request: NextRequest) {
  try {
    const { token, password } = await request.json();
    await apiSetPassword(token, password);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const message = error instanceof ApiError ? error.message : 'Failed to set password';
    return NextResponse.json({ message }, { status });
  }
}
