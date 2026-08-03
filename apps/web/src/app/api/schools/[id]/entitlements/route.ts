import { NextRequest, NextResponse } from 'next/server';
import { apiGrantSchoolEntitlement, ApiError } from '@/lib/api-client';
import { getAccessToken } from '@/lib/session';

// Segment is [id] rather than [schoolId] because Next.js allows only one slug name per
// path position, and the sibling /api/schools/[id] route already claimed it.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const accessToken = getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
  }

  const input = await request.json();

  try {
    const entitlement = await apiGrantSchoolEntitlement(accessToken, params.id, input);
    return NextResponse.json(entitlement, { status: 201 });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const message = error instanceof ApiError ? error.message : 'Failed to grant entitlement';
    return NextResponse.json({ message }, { status });
  }
}
