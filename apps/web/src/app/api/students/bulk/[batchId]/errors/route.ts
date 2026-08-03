import { NextResponse } from 'next/server';
import { apiGetStudentImportErrors, ApiError } from '@/lib/api-client';
import { getAccessToken } from '@/lib/session';

export async function GET(_request: Request, { params }: { params: { batchId: string } }) {
  const accessToken = getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
  }

  try {
    const csv = await apiGetStudentImportErrors(accessToken, params.batchId);
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="student-import-errors.csv"',
      },
    });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const message = error instanceof ApiError ? error.message : 'Failed to download the error report';
    return NextResponse.json({ message }, { status });
  }
}
