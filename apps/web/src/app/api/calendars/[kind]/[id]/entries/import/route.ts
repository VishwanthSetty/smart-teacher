import { NextRequest } from 'next/server';
import { apiImportCalendarEntries } from '@/lib/api-client';
import { parseKind, relay, unknownKind } from '../../../../_relay';

export async function POST(request: NextRequest, { params }: { params: { kind: string; id: string } }) {
  const kind = parseKind(params.kind);
  if (!kind) {
    return unknownKind();
  }
  // Re-read into a fresh FormData so undici sets its own boundary on the outbound
  // request; forwarding the raw stream would keep the inbound boundary header.
  const form = await request.formData();

  return relay('Failed to upload the file', (accessToken) =>
    apiImportCalendarEntries(accessToken, kind, params.id, form),
  );
}
