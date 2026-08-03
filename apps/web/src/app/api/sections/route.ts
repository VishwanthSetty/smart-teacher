import { NextRequest, NextResponse } from 'next/server';
import { apiCreateSection, ApiError } from '@/lib/api-client';
import { getAccessToken } from '@/lib/session';

export async function POST(request: NextRequest) {
  const accessToken = getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
  }

  const input = await request.json();

  try {
    const section = await apiCreateSection(accessToken, input);
    return NextResponse.json(section, { status: 201 });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const message = error instanceof ApiError ? error.message : 'Failed to create section';
    return NextResponse.json({ message }, { status });
  }
}
