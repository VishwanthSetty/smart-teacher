import { NextRequest, NextResponse } from 'next/server';
import { apiCloneCurriculumSchema, ApiError } from '@/lib/api-client';
import { getAccessToken } from '@/lib/session';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const token = getAccessToken(); if (!token) return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
  try { return NextResponse.json(await apiCloneCurriculumSchema(token, params.id, await request.json()), { status: 201 }); }
  catch (error) { return NextResponse.json({ message: error instanceof ApiError ? error.message : 'Failed to clone schema' }, { status: error instanceof ApiError ? error.status : 500 }); }
}
