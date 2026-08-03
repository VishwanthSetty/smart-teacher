import { NextRequest, NextResponse } from 'next/server';
import { apiRetryVideo, ApiError } from '@/lib/api-client';
import { getAccessToken } from '@/lib/session';

export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const accessToken = getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
  }

  try {
    const video = await apiRetryVideo(accessToken, params.id);
    return NextResponse.json(video, { status: 200 });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const message = error instanceof ApiError ? error.message : 'Failed to restart transcoding';
    return NextResponse.json({ message }, { status });
  }
}
