import { NextResponse } from 'next/server';
import { apiGetAdminCurriculumTree, ApiError } from '@/lib/api-client';
import { getAccessToken } from '@/lib/session';

// The content-node picker is a client component — it cannot see the access token, so the
// tree it loads when a curriculum is chosen comes through here.
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const accessToken = getAccessToken();
  if (!accessToken) return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
  try {
    return NextResponse.json(await apiGetAdminCurriculumTree(accessToken, params.id));
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const message = error instanceof ApiError ? error.message : 'Failed to load curriculum tree';
    return NextResponse.json({ message }, { status });
  }
}
