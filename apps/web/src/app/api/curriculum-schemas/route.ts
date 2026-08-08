import { NextRequest, NextResponse } from 'next/server';
import { apiCreateCurriculumSchema, ApiError } from '@/lib/api-client';
import { getAccessToken } from '@/lib/session';

export async function POST(request: NextRequest) {
  const token = getAccessToken();
  if (!token) return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
  try { return NextResponse.json(await apiCreateCurriculumSchema(token, await request.json()), { status: 201 }); }
  catch (error) { return NextResponse.json({ message: error instanceof ApiError ? error.message : 'Failed to create schema' }, { status: error instanceof ApiError ? error.status : 500 }); }
}
