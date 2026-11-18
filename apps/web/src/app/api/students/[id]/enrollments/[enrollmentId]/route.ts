import { NextRequest, NextResponse } from 'next/server';
import { apiRemoveStudentEnrollment, apiUpdateStudentEnrollment, ApiError } from '@/lib/api-client';
import { getAccessToken } from '@/lib/session';

type Params = { params: { id: string; enrollmentId: string } };

function errorResponse(error: unknown, fallback: string): NextResponse {
  const status = error instanceof ApiError ? error.status : 500;
  const message = error instanceof ApiError ? error.message : fallback;
  return NextResponse.json({ message }, { status });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const accessToken = getAccessToken();
  if (!accessToken) return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
  const input = await request.json();
  try {
    return NextResponse.json(await apiUpdateStudentEnrollment(accessToken, params.id, params.enrollmentId, input));
  } catch (error) {
    return errorResponse(error, 'Failed to update the class');
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const accessToken = getAccessToken();
  if (!accessToken) return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
  try {
    await apiRemoveStudentEnrollment(accessToken, params.id, params.enrollmentId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return errorResponse(error, 'Failed to remove the class');
  }
}
