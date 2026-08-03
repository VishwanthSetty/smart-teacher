import { NextRequest, NextResponse } from 'next/server';
import { apiDeleteTeacherAssignment, ApiError } from '@/lib/api-client';
import { getAccessToken } from '@/lib/session';

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const accessToken = getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
  }

  try {
    await apiDeleteTeacherAssignment(accessToken, params.id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const message = error instanceof ApiError ? error.message : 'Failed to remove assignment';
    return NextResponse.json({ message }, { status });
  }
}
