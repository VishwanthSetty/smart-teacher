import { NextRequest, NextResponse } from 'next/server';
import { apiDeleteContentNode, apiUpdateContentNode, ApiError } from '@/lib/api-client';
import { getAccessToken } from '@/lib/session';

function fail(error: unknown, fallback: string) { return NextResponse.json({ message: error instanceof ApiError ? error.message : fallback }, { status: error instanceof ApiError ? error.status : 500 }); }

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const token = getAccessToken(); if (!token) return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
  try { return NextResponse.json(await apiUpdateContentNode(token, params.id, await request.json())); } catch (error) { return fail(error, 'Failed to update node'); }
}
export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const token = getAccessToken(); if (!token) return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
  try { await apiDeleteContentNode(token, params.id); return new NextResponse(null, { status: 204 }); } catch (error) { return fail(error, 'Failed to delete node'); }
}
