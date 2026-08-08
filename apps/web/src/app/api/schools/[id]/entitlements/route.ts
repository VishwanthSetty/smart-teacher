import { NextRequest, NextResponse } from 'next/server';
import { apiGrantSchoolEntitlement, apiReplaceSchoolEntitlements, ApiError } from '@/lib/api-client';
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

// The checkbox-matrix batch save — replaces the whole entitlement set in one request.
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const accessToken = getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
  }

  const { curriculumIds } = await request.json();

  try {
    const entitlements = await apiReplaceSchoolEntitlements(accessToken, params.id, curriculumIds);
    return NextResponse.json(entitlements);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const message = error instanceof ApiError ? error.message : 'Failed to update entitlements';
    return NextResponse.json({ message }, { status });
  }
}
