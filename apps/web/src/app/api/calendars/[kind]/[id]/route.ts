import { NextRequest } from 'next/server';
import { apiDeleteCalendar } from '@/lib/api-client';
import { parseKind, relay, unknownKind } from '../../_relay';

export async function DELETE(_request: NextRequest, { params }: { params: { kind: string; id: string } }) {
  const kind = parseKind(params.kind);
  if (!kind) {
    return unknownKind();
  }
  return relay('Failed to delete calendar', (accessToken) => apiDeleteCalendar(accessToken, kind, params.id));
}
