import { NextRequest, NextResponse } from 'next/server';
import { apiConfirmBulkContent, ApiError } from '@/lib/api-client';
import { getAccessToken } from '@/lib/session';

export async function POST(request: NextRequest) {
  const accessToken = getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
  }

  const input = await request.json();

  try {
    return NextResponse.json(await apiConfirmBulkContent(accessToken, input));
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const message = error instanceof ApiError ? error.message : 'Failed to confirm the upload';
    return NextResponse.json({ message }, { status });
  }
}
