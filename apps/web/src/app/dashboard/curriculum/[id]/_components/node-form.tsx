'use client';

import { FormEvent, useState } from 'react';
import { Button } from '@/components/ui/button';

export function NodeForm({ curriculumId, parentId, levelName, onSaved, onCancel }: { curriculumId: string; parentId: string | null; levelName: string; onSaved: () => void; onCancel?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    setError(null);
    const data = new FormData(form);
    const response = await fetch(`/api/curricula/${curriculumId}/nodes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ parentId, code: data.get('code'), title: data.get('title'), description: String(data.get('description') ?? '') || undefined }) });
    setBusy(false);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.message ?? `Could not add ${levelName}`);
      return;
    }
    form.reset();
    onSaved();
  }

  return (
    <form onSubmit={submit} className="mt-4 grid gap-3 rounded-xl border border-brand-soft bg-brand-tint/60 p-4">
      <div className="grid gap-3 sm:grid-cols-2"><label className="field-label">{levelName} title<input required name="title" className="field bg-white" /></label><label className="field-label">Code<input required name="code" pattern="[A-Za-z0-9][A-Za-z0-9_-]*" className="field bg-white font-mono" /></label></div>
      <label className="field-label">Description<textarea name="description" rows={2} className="field resize-y bg-white" /></label>
      {error ? <p className="text-sm text-status-danger">{error}</p> : null}
      <div className="flex gap-2"><Button type="submit" disabled={busy}>{busy ? 'Adding…' : `Add ${levelName}`}</Button>{onCancel ? <Button variant="ghost" onClick={onCancel}>Cancel</Button> : null}</div>
    </form>
  );
}
