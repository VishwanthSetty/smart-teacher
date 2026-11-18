import { NextRequest, NextResponse } from 'next/server';
import { apiCreateBulkContent, ApiError } from '@/lib/api-client';
import { getAccessToken } from '@/lib/session';

export async function POST(request: NextRequest) {
  const accessToken = getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
  }

  const input = await request.json();

  try {
    return NextResponse.json(await apiCreateBulkContent(accessToken, input));
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const message = error instanceof ApiError ? error.message : 'Failed to prepare the uploads';
    return NextResponse.json({ message }, { status });
  }
}
