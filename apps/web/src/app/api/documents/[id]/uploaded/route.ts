import { NextRequest, NextResponse } from 'next/server';
import { apiConfirmDocumentUpload, ApiError } from '@/lib/api-client';
import { getAccessToken } from '@/lib/session';

export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const accessToken = getAccessToken();
  if (!accessToken) return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
  try {
    return NextResponse.json(await apiConfirmDocumentUpload(accessToken, params.id));
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof ApiError ? error.message : 'Failed to confirm upload' },
      { status: error instanceof ApiError ? error.status : 500 },
    );
  }
}
