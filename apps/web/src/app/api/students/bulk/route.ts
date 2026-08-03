import { NextRequest, NextResponse } from 'next/server';
import { apiUploadStudentImport, ApiError } from '@/lib/api-client';
import { getAccessToken } from '@/lib/session';

export async function POST(request: NextRequest) {
  const accessToken = getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
  }

  // Re-reading the multipart body into a fresh FormData is what lets undici set its own
  // boundary on the outbound request; forwarding the raw stream would keep the inbound
  // boundary header and the API would fail to parse it.
  const form = await request.formData();

  try {
    const preview = await apiUploadStudentImport(accessToken, form);
    return NextResponse.json(preview, { status: 201 });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const message = error instanceof ApiError ? error.message : 'Failed to upload the file';
    return NextResponse.json({ message }, { status });
  }
}
