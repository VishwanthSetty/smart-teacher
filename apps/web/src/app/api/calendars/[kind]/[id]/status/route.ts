import { NextRequest } from 'next/server';
import { apiSetCalendarPublished } from '@/lib/api-client';
import { parseKind, relay, unknownKind } from '../../../_relay';

// One BFF route for both transitions; the API keeps them as separate publish/unpublish
// endpoints.
export async function POST(request: NextRequest, { params }: { params: { kind: string; id: string } }) {
  const kind = parseKind(params.kind);
  if (!kind) {
    return unknownKind();
  }
  const body: { isPublished?: unknown } = await request.json();

  return relay('Failed to change calendar status', (accessToken) =>
    apiSetCalendarPublished(accessToken, kind, params.id, body.isPublished === true),
  );
}
