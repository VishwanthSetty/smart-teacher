import { NextRequest, NextResponse } from 'next/server';
import { apiUpdateStudent, ApiError } from '@/lib/api-client';
import { getAccessToken } from '@/lib/session';

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const accessToken = getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
  }

  const patch = await request.json();

  try {
    const student = await apiUpdateStudent(accessToken, params.id, patch);
    return NextResponse.json(student);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const message = error instanceof ApiError ? error.message : 'Failed to update student';
    return NextResponse.json({ message }, { status });
  }
}
