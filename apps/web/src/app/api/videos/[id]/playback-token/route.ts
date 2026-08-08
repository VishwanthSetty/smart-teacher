import { NextResponse } from 'next/server';
import { ApiError, apiGetPlaybackToken } from '@/lib/api-client';
import { getAccessToken } from '@/lib/session';

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const accessToken = getAccessToken();
  if (!accessToken) return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
  try {
    return NextResponse.json(await apiGetPlaybackToken(accessToken, params.id));
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const message = error instanceof ApiError ? error.message : 'Failed to authorize playback';
    return NextResponse.json({ message }, { status });
  }
}
