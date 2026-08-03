import { NextResponse } from 'next/server';
import { apiGetStudentImportTemplate, ApiError } from '@/lib/api-client';
import { getAccessToken } from '@/lib/session';

export async function GET() {
  const accessToken = getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
  }

  try {
    const csv = await apiGetStudentImportTemplate(accessToken);
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="student-import-template.csv"',
      },
    });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const message = error instanceof ApiError ? error.message : 'Failed to download the template';
    return NextResponse.json({ message }, { status });
  }
}
