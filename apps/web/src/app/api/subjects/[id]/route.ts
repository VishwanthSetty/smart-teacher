import { NextRequest, NextResponse } from 'next/server';
import { apiUpdateSubject, ApiError } from '@/lib/api-client';
import { getAccessToken } from '@/lib/session';

// Relays the API's 409 verbatim: retiring a subject fails while any video or school
// entitlement still references it, and the operator needs that reason, not a generic
// failure.
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const accessToken = getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
  }

  const patch = await request.json();

  try {
    const subject = await apiUpdateSubject(accessToken, params.id, patch);
    return NextResponse.json(subject);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const message = error instanceof ApiError ? error.message : 'Failed to update subject';
    return NextResponse.json({ message }, { status });
  }
}
