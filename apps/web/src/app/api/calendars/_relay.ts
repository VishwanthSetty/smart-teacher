import { NextResponse } from 'next/server';
import { ApiError, type CalendarKind } from '@/lib/api-client';
import { getAccessToken } from '@/lib/session';

// The calendar BFF serves both a platform default (`platform`) and a school's own
// calendar (`school`) from one route tree, because the two API resources share a shape.
// The API remains the authority on who may touch which: SUPER_ADMIN only for platform,
// SCHOOL_ADMIN only for school.
export function parseKind(value: string): CalendarKind | null {
  return value === 'platform' || value === 'school' ? value : null;
}

// Relays the API's status and message verbatim: a 409 ("add at least one entry before
// publishing") or 422 ("outside the academic year") is the operator's next step, not a
// generic failure.
export async function relay(
  fallbackMessage: string,
  call: (accessToken: string) => Promise<unknown>,
  successStatus = 200,
): Promise<NextResponse> {
  const accessToken = getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
  }

  try {
    const result = await call(accessToken);
    return result === undefined
      ? new NextResponse(null, { status: 204 })
      : NextResponse.json(result, { status: successStatus });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const message = error instanceof ApiError ? error.message : fallbackMessage;
    return NextResponse.json({ message }, { status });
  }
}

export function unknownKind(): NextResponse {
  return NextResponse.json({ message: 'Not found' }, { status: 404 });
}
