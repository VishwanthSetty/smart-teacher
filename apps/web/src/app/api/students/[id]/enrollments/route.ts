import { NextRequest, NextResponse } from 'next/server';
import { apiAddStudentEnrollment, ApiError } from '@/lib/api-client';
import { getAccessToken } from '@/lib/session';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const accessToken = getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
  }

  const input = await request.json();

  try {
    const student = await apiAddStudentEnrollment(accessToken, params.id, input);
    return NextResponse.json(student, { status: 201 });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const message = error instanceof ApiError ? error.message : 'Failed to add the class';
    return NextResponse.json({ message }, { status });
  }
}
