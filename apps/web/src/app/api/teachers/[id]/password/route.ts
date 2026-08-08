import { NextRequest, NextResponse } from 'next/server';
import { apiGetTeacherPassword, apiSetTeacherPassword, ApiError } from '@/lib/api-client';
import { getAccessToken } from '@/lib/session';

function errorResponse(error: unknown): NextResponse {
  const status = error instanceof ApiError ? error.status : 500;
  const message = error instanceof ApiError ? error.message : 'Failed to manage the teacher password';
  return NextResponse.json({ message }, { status });
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const accessToken = getAccessToken();
  if (!accessToken) return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
  try {
    return NextResponse.json(await apiGetTeacherPassword(accessToken, params.id));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const accessToken = getAccessToken();
  if (!accessToken) return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
  const input = await request.json();
  try {
    return NextResponse.json(await apiSetTeacherPassword(accessToken, params.id, input.password));
  } catch (error) {
    return errorResponse(error);
  }
}
