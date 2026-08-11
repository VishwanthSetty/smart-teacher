import { NextRequest, NextResponse } from 'next/server';
import { apiGetDocumentDownload, ApiError } from '@/lib/api-client';
import { getAccessToken } from '@/lib/session';

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const accessToken = getAccessToken();
  if (!accessToken) return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
  try {
    const download = await apiGetDocumentDownload(accessToken, params.id);
    return NextResponse.redirect(download.url);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof ApiError ? error.message : 'Failed to download document' },
      { status: error instanceof ApiError ? error.status : 500 },
    );
  }
}
