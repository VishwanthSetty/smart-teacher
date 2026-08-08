'use client';

import { FormEvent, useState } from 'react';

export function NodeForm({ curriculumId, parentId, levelName, onSaved, onCancel }: { curriculumId: string; parentId: string | null; levelName: string; onSaved: () => void; onCancel?: () => void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; setBusy(true); setError(null); const data = new FormData(form);
    const response = await fetch(`/api/curricula/${curriculumId}/nodes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ parentId, code: data.get('code'), title: data.get('title'), description: String(data.get('description') ?? '') || undefined }) });
    setBusy(false); if (!response.ok) { const body = await response.json().catch(() => ({})); setError(body.message ?? `Could not add ${levelName}`); return; }
    form.reset(); onSaved();
  }
  return <form onSubmit={submit} className="mt-3 grid gap-3 rounded border bg-gray-50 p-3">
    <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm">{levelName} title<input required name="title" className="rounded border px-3 py-2" /></label><label className="grid gap-1 text-sm">Code<input required name="code" pattern="[A-Za-z0-9][A-Za-z0-9_-]*" className="rounded border px-3 py-2 font-mono" /></label></div>
    <label className="grid gap-1 text-sm">Description<textarea name="description" className="rounded border px-3 py-2" /></label>
    {error && <p className="text-sm text-red-600">{error}</p>}<div className="flex gap-2"><button disabled={busy} className="rounded bg-gray-900 px-3 py-1.5 text-sm text-white disabled:opacity-50">{busy ? 'Adding…' : `Add ${levelName}`}</button>{onCancel && <button type="button" onClick={onCancel} className="rounded border px-3 py-1.5 text-sm">Cancel</button>}</div>
  </form>;
}
