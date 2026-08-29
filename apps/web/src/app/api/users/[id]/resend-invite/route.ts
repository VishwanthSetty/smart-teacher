import { NextResponse } from 'next/server';
import { ApiError, apiResendUserInvite } from '@/lib/api-client';
import { getAccessToken } from '@/lib/session';

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const accessToken = getAccessToken();
  if (!accessToken) return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
  try {
    await apiResendUserInvite(accessToken, params.id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const message = error instanceof ApiError ? error.message : 'Failed to resend the invite';
    return NextResponse.json({ message }, { status });
  }
}
