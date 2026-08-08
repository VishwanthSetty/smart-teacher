import { NextResponse } from 'next/server';
import { apiPublishCurriculum, ApiError } from '@/lib/api-client';
import { getAccessToken } from '@/lib/session';

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const token = getAccessToken();
  if (!token) return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
  try { return NextResponse.json(await apiPublishCurriculum(token, params.id)); }
  catch (error) { return NextResponse.json({ message: error instanceof ApiError ? error.message : 'Failed to publish curriculum' }, { status: error instanceof ApiError ? error.status : 500 }); }
}
