import { NextRequest, NextResponse } from 'next/server';
import { apiDeleteDocument, apiUpdateDocument, ApiError } from '@/lib/api-client';
import { getAccessToken } from '@/lib/session';

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const accessToken = getAccessToken();
  if (!accessToken) return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
  try {
    return NextResponse.json(await apiUpdateDocument(accessToken, params.id, await request.json()));
  } catch (error) {
    return failure(error, 'Failed to update document');
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const accessToken = getAccessToken();
  if (!accessToken) return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
  try {
    await apiDeleteDocument(accessToken, params.id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return failure(error, 'Failed to delete document');
  }
}

function failure(error: unknown, fallback: string): NextResponse {
  return NextResponse.json(
    { message: error instanceof ApiError ? error.message : fallback },
    { status: error instanceof ApiError ? error.status : 500 },
  );
}
