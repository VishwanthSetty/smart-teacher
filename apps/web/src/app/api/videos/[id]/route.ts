import { NextRequest, NextResponse } from 'next/server';
import { apiDeleteVideo, apiUpdateVideo, ApiError } from '@/lib/api-client';
import { getAccessToken } from '@/lib/session';

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const accessToken = getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
  }

  try {
    await apiDeleteVideo(accessToken, params.id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const message = error instanceof ApiError ? error.message : 'Failed to delete video';
    return NextResponse.json({ message }, { status });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const accessToken = getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
  }
  try {
    const video = await apiUpdateVideo(accessToken, params.id, await request.json());
    return NextResponse.json(video);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const message = error instanceof ApiError ? error.message : 'Failed to update video';
    return NextResponse.json({ message }, { status });
  }
}
