import { NextRequest, NextResponse } from 'next/server';
import { apiCreateTeacherAssignment, ApiError } from '@/lib/api-client';
import { getAccessToken } from '@/lib/session';

export async function POST(request: NextRequest) {
  const accessToken = getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
  }

  const input = await request.json();

  try {
    const assignment = await apiCreateTeacherAssignment(accessToken, input);
    return NextResponse.json(assignment, { status: 201 });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const message = error instanceof ApiError ? error.message : 'Failed to create assignment';
    return NextResponse.json({ message }, { status });
  }
}
