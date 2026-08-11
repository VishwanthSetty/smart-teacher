import { NextRequest, NextResponse } from 'next/server';
import { apiCreateDocumentUploadUrl, ApiError } from '@/lib/api-client';
import { getAccessToken } from '@/lib/session';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const accessToken = getAccessToken();
  if (!accessToken) return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
  try {
    return NextResponse.json(
      await apiCreateDocumentUploadUrl(accessToken, params.id, await request.json()),
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof ApiError ? error.message : 'Failed to create upload URL' },
      { status: error instanceof ApiError ? error.status : 500 },
    );
  }
}
