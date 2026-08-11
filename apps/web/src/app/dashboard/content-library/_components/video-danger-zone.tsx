'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePathname } from 'next/navigation';
import { VideoStatus, type ContentImpact } from '@smart-teacher/shared-types';

export function VideoDangerZone({ id, title, status, impact, canRetry }: { id: string; title: string; status: VideoStatus; impact: ContentImpact; canRetry: boolean }) {
  const router = useRouter(); const pathname = usePathname(); const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  async function retry() { setBusy(true); const response = await fetch(`/api/videos/${id}/retry`, { method: 'POST' }); setBusy(false); if (!response.ok) { const body = await response.json().catch(() => ({})); setError(body.message ?? 'Retry failed'); return; } router.refresh(); }
  async function remove() {
    if (!window.confirm(`Delete “${title}”? This classification reaches ${impact.schoolCount} schools, ${impact.studentCount} active students, and ${impact.teacherCount} assigned teachers. All HLS output and the source will be removed.`)) return;
    setBusy(true); const response = await fetch(`/api/videos/${id}`, { method: 'DELETE' }); setBusy(false);
    if (!response.ok) { const body = await response.json().catch(() => ({})); setError(body.message ?? 'Delete failed'); return; }
    router.push(pathname.replace(`/${id}`, '')); router.refresh();
  }
  return <section className="rounded-lg border border-red-200 bg-red-50 p-5"><h2 className="font-semibold text-red-900">Danger zone</h2><div className="mt-3 flex gap-3">{status === VideoStatus.FAILED && <button disabled={busy || !canRetry} onClick={() => void retry()} className="rounded border px-3 py-2 disabled:opacity-50">Retry transcode</button>}<button disabled={busy || status === VideoStatus.PROCESSING} onClick={() => void remove()} className="rounded bg-red-700 px-3 py-2 text-white disabled:opacity-50">Delete video</button></div>{!canRetry && status === VideoStatus.FAILED && <p className="mt-2 text-sm">Retry is unavailable because the ingest source was removed.</p>}{error && <p className="mt-2 text-sm text-red-700">{error}</p>}</section>;
}
