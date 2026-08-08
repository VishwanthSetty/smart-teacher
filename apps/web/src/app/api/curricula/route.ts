import { NextRequest, NextResponse } from 'next/server';
import { apiCreateCurriculum, ApiError } from '@/lib/api-client';
import { getAccessToken } from '@/lib/session';

export async function POST(request: NextRequest) {
  const token = getAccessToken();
  if (!token) return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
  try {
    return NextResponse.json(await apiCreateCurriculum(token, await request.json()), { status: 201 });
  } catch (error) {
    return apiError(error, 'Failed to create curriculum');
  }
}

function apiError(error: unknown, fallback: string) {
  return NextResponse.json(
    { message: error instanceof ApiError ? error.message : fallback },
    { status: error instanceof ApiError ? error.status : 500 },
  );
}
