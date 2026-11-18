import { NextRequest } from 'next/server';
import { apiAddCalendarEntry } from '@/lib/api-client';
import { parseKind, relay, unknownKind } from '../../../_relay';

export async function POST(request: NextRequest, { params }: { params: { kind: string; id: string } }) {
  const kind = parseKind(params.kind);
  if (!kind) {
    return unknownKind();
  }
  const input = await request.json();

  return relay('Failed to add entry', (accessToken) => apiAddCalendarEntry(accessToken, kind, params.id, input), 201);
}
