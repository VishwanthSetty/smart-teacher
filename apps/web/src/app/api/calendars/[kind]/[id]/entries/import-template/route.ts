import { NextRequest, NextResponse } from 'next/server';
import { ApiError, apiGetCalendarImportTemplate } from '@/lib/api-client';
import { getAccessToken } from '@/lib/session';
import { parseKind, unknownKind } from '../../../../_relay';

// Binary download, so it cannot go through `relay`, which answers JSON.
export async function GET(_request: NextRequest, { params }: { params: { kind: string; id: string } }) {
  const kind = parseKind(params.kind);
  if (!kind) {
    return unknownKind();
  }
  const accessToken = getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
  }

  try {
    const workbook = await apiGetCalendarImportTemplate(accessToken, kind, params.id);
    return new NextResponse(workbook, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="academic-calendar-template.xlsx"',
      },
    });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const message = error instanceof ApiError ? error.message : 'Failed to download the template';
    return NextResponse.json({ message }, { status });
  }
}
