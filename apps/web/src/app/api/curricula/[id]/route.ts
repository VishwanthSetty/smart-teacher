import { NextRequest, NextResponse } from 'next/server';
import { apiDeleteCurriculum, apiUpdateCurriculum, ApiError } from '@/lib/api-client';
import { getAccessToken } from '@/lib/session';

function tokenOrResponse() {
  return getAccessToken() ?? NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
}
function failure(error: unknown, message: string) {
  return NextResponse.json({ message: error instanceof ApiError ? error.message : message }, { status: error instanceof ApiError ? error.status : 500 });
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const token = tokenOrResponse();
  if (typeof token !== 'string') return token;
  try { return NextResponse.json(await apiUpdateCurriculum(token, params.id, await request.json())); }
  catch (error) { return failure(error, 'Failed to update curriculum'); }
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const token = tokenOrResponse();
  if (typeof token !== 'string') return token;
  try { await apiDeleteCurriculum(token, params.id); return new NextResponse(null, { status: 204 }); }
  catch (error) { return failure(error, 'Failed to delete curriculum'); }
}
