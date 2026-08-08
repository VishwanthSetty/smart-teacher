import { NextResponse } from 'next/server';
import { apiConfirmTeacherImport, ApiError } from '@/lib/api-client';
import { getAccessToken } from '@/lib/session';

export async function POST(request: Request, { params }: { params: { batchId: string } }) {
  const accessToken = getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
  }

  try {
    const input = await request.json().catch(() => ({}));
    const result = await apiConfirmTeacherImport(accessToken, params.batchId, input);
    return NextResponse.json(result);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const message = error instanceof ApiError ? error.message : 'Failed to import the teachers';
    return NextResponse.json({ message }, { status });
  }
}
