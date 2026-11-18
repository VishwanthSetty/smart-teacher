import { NextRequest } from 'next/server';
import { apiUpdateCalendarSetting } from '@/lib/api-client';
import { relay } from '../../calendars/_relay';

export async function PUT(request: NextRequest, { params }: { params: { academicYearId: string } }) {
  const body: { isEnabled?: unknown } = await request.json();
  return relay('Failed to update calendar setting', (accessToken) =>
    apiUpdateCalendarSetting(accessToken, params.academicYearId, body.isEnabled === true),
  );
}
