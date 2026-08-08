'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CurriculumStatus } from '@smart-teacher/shared-types';

export function PublishControls({ id, status }: { id: string; status: CurriculumStatus }) {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  async function transition(action: 'publish' | 'unpublish') { setBusy(true); setError(null); const response = await fetch(`/api/curricula/${id}/${action}`, { method: 'POST' }); setBusy(false); if (!response.ok) { const body = await response.json().catch(() => ({})); setError(body.message ?? `Could not ${action}`); return; } router.refresh(); }
  return <div className="flex flex-wrap items-center gap-3">{status === CurriculumStatus.PUBLISHED ? <button disabled={busy} onClick={() => transition('unpublish')} className="rounded border border-amber-300 px-3 py-2 text-sm text-amber-800 disabled:opacity-50">Unpublish</button> : status === CurriculumStatus.DRAFT ? <button disabled={busy} onClick={() => transition('publish')} className="rounded bg-green-700 px-3 py-2 text-sm text-white disabled:opacity-50">Publish</button> : <span className="text-sm text-gray-500">Archived curricula cannot be published.</span>}{error && <span className="text-sm text-red-600">{error}</span>}</div>;
}
