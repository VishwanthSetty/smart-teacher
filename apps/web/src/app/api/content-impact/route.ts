import { NextRequest, NextResponse } from 'next/server';
import { apiGetContentImpact, ApiError } from '@/lib/api-client';
import { getAccessToken } from '@/lib/session';

export async function GET(request: NextRequest) {
  const accessToken = getAccessToken();
  if (!accessToken) return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
  const gradeLevelId = request.nextUrl.searchParams.get('gradeLevelId') ?? '';
  const subjectId = request.nextUrl.searchParams.get('subjectId') ?? '';
  try {
    return NextResponse.json(await apiGetContentImpact(accessToken, gradeLevelId, subjectId));
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const message = error instanceof ApiError ? error.message : 'Failed to load impact';
    return NextResponse.json({ message }, { status });
  }
}
