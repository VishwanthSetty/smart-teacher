import { NextRequest } from 'next/server';
import { apiDeleteAcademicYear, apiUpdateAcademicYear } from '@/lib/api-client';
import { relay } from '../../calendars/_relay';

// Both can be refused with a 409 — narrowing past existing entries, or deleting a year
// calendars still use — and the operator needs that reason.
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const input = await request.json();
  return relay('Failed to update academic year', (accessToken) => apiUpdateAcademicYear(accessToken, params.id, input));
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  return relay('Failed to delete academic year', (accessToken) => apiDeleteAcademicYear(accessToken, params.id));
}
