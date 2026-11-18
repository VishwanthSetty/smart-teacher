import { NextRequest } from 'next/server';
import { apiDeleteCalendarEntry, apiUpdateCalendarEntry } from '@/lib/api-client';
import { parseKind, relay, unknownKind } from '../../../../_relay';

type Params = { params: { kind: string; id: string; entryId: string } };

export async function PATCH(request: NextRequest, { params }: Params) {
  const kind = parseKind(params.kind);
  if (!kind) {
    return unknownKind();
  }
  const input = await request.json();

  return relay('Failed to update entry', (accessToken) =>
    apiUpdateCalendarEntry(accessToken, kind, params.id, params.entryId, input),
  );
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const kind = parseKind(params.kind);
  if (!kind) {
    return unknownKind();
  }
  return relay('Failed to delete entry', (accessToken) =>
    apiDeleteCalendarEntry(accessToken, kind, params.id, params.entryId),
  );
}
