import { NextRequest } from 'next/server';
import { apiCreatePlatformCalendar, apiCreateSchoolCalendar } from '@/lib/api-client';
import { parseKind, relay, unknownKind } from '../_relay';

export async function POST(request: NextRequest, { params }: { params: { kind: string } }) {
  const kind = parseKind(params.kind);
  if (!kind) {
    return unknownKind();
  }
  const input = await request.json();

  return relay(
    'Failed to create calendar',
    (accessToken) =>
      kind === 'platform' ? apiCreatePlatformCalendar(accessToken, input) : apiCreateSchoolCalendar(accessToken, input),
    201,
  );
}
