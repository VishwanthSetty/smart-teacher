import { NextRequest } from 'next/server';
import { apiCreateAcademicYear } from '@/lib/api-client';
import { relay } from '../calendars/_relay';

export async function POST(request: NextRequest) {
  const input = await request.json();
  return relay('Failed to create academic year', (accessToken) => apiCreateAcademicYear(accessToken, input), 201);
}
