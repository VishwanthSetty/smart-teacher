'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CurriculumSchema } from '@smart-teacher/shared-types';
import { LevelListEditor, type EditableLevel } from './level-list-editor';

export function SchemaForm({ schema, onDone }: { schema?: CurriculumSchema; onDone?: () => void }) {
  const router = useRouter();
  const [levels, setLevels] = useState<EditableLevel[]>(schema?.levels.map(({ depth, name, canHoldContent }) => ({ depth, name, canHoldContent })) ?? [{ depth: 1, name: 'Chapter', canHoldContent: false }, { depth: 2, name: 'Topic', canHoldContent: true }]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null);
    const data = new FormData(event.currentTarget);
    const body = { name: data.get('name'), ...(schema ? {} : { code: data.get('code') }), description: String(data.get('description') ?? '') || undefined, levels };
    const response = await fetch(schema ? `/api/curriculum-schemas/${schema.id}` : '/api/curriculum-schemas', { method: schema ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    setBusy(false);
    if (!response.ok) { const result = await response.json().catch(() => ({})); setError(result.message ?? 'Could not save schema'); return; }
    router.refresh(); onDone?.();
  }
  return <form onSubmit={submit} className="grid gap-4 rounded-lg border bg-white p-5 shadow-sm">
    <div className="grid gap-4 md:grid-cols-2">
      <label className="grid gap-1 text-sm">Name<input name="name" required defaultValue={schema?.name} className="rounded border px-3 py-2" /></label>
      <label className="grid gap-1 text-sm">Code<input name="code" required={!schema} disabled={Boolean(schema)} defaultValue={schema?.code} pattern="[a-z0-9]+(-[a-z0-9]+)*" className="rounded border px-3 py-2 font-mono disabled:bg-gray-50" /></label>
    </div>
    <label className="grid gap-1 text-sm">Description<textarea name="description" defaultValue={schema?.description ?? ''} className="rounded border px-3 py-2" /></label>
    <div><h3 className="mb-2 text-sm font-medium">Levels, shallowest first</h3><LevelListEditor levels={levels} onChange={setLevels} /></div>
    {error && <p className="text-sm text-red-600">{error}</p>}
    <button disabled={busy} className="w-fit rounded bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-50">{busy ? 'Saving…' : schema ? 'Save schema' : 'Create schema'}</button>
  </form>;
}
