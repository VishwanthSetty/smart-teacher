import { NextRequest, NextResponse } from 'next/server';
import { apiRevokeSchoolEntitlement, ApiError } from '@/lib/api-client';
import { getAccessToken } from '@/lib/session';

// `id` is the school and `entitlementId` the grant: Next.js rejects the same slug name
// twice in one path, so the nested segment cannot also be [id].
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; entitlementId: string } },
) {
  const accessToken = getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
  }

  try {
    await apiRevokeSchoolEntitlement(accessToken, params.id, params.entitlementId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const message = error instanceof ApiError ? error.message : 'Failed to revoke entitlement';
    return NextResponse.json({ message }, { status });
  }
}
