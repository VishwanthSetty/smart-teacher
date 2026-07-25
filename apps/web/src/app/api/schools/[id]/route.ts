import { NextRequest, NextResponse } from 'next/server';
import { apiUpdateSchool, ApiError } from '@/lib/api-client';
import { getAccessToken } from '@/lib/session';

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const accessToken = getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
  }

  const patch = await request.json();

  try {
    const school = await apiUpdateSchool(accessToken, params.id, patch);
    return NextResponse.json(school);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const message = error instanceof ApiError ? error.message : 'Failed to update school';
    return NextResponse.json({ message }, { status });
  }
}
