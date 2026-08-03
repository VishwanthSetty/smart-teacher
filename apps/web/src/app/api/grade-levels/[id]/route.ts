import { NextRequest, NextResponse } from 'next/server';
import { apiDeleteGradeLevel, apiUpdateGradeLevel, ApiError } from '@/lib/api-client';
import { getAccessToken } from '@/lib/session';

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const accessToken = getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
  }

  const patch = await request.json();

  try {
    const gradeLevel = await apiUpdateGradeLevel(accessToken, params.id, patch);
    return NextResponse.json(gradeLevel);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const message = error instanceof ApiError ? error.message : 'Failed to update grade level';
    return NextResponse.json({ message }, { status });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const accessToken = getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
  }

  try {
    await apiDeleteGradeLevel(accessToken, params.id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const message = error instanceof ApiError ? error.message : 'Failed to delete grade level';
    return NextResponse.json({ message }, { status });
  }
}
