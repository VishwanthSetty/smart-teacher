import { NextRequest, NextResponse } from 'next/server';
import { apiMoveContentNode, ApiError } from '@/lib/api-client';
import { getAccessToken } from '@/lib/session';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const token = getAccessToken(); if (!token) return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
  try { return NextResponse.json(await apiMoveContentNode(token, params.id, await request.json())); }
  catch (error) { return NextResponse.json({ message: error instanceof ApiError ? error.message : 'Failed to move node' }, { status: error instanceof ApiError ? error.status : 500 }); }
}
