import { NextRequest, NextResponse } from 'next/server';
import { apiCreateDocument, ApiError } from '@/lib/api-client';
import { getAccessToken } from '@/lib/session';

export async function POST(request: NextRequest) {
  const accessToken = getAccessToken();
  if (!accessToken) return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
  try {
    return NextResponse.json(await apiCreateDocument(accessToken, await request.json()), { status: 201 });
  } catch (error) {
    return apiFailure(error, 'Failed to create document');
  }
}

function apiFailure(error: unknown, fallback: string): NextResponse {
  return NextResponse.json(
    { message: error instanceof ApiError ? error.message : fallback },
    { status: error instanceof ApiError ? error.status : 500 },
  );
}
