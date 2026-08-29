'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CurriculumSchema } from '@smart-teacher/shared-types';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { LevelListEditor, type EditableLevel } from './level-list-editor';

export function SchemaForm({ schema, onDone }: { schema?: CurriculumSchema; onDone?: () => void }) {
  const router = useRouter();
  const [levels, setLevels] = useState<EditableLevel[]>(schema?.levels.map(({ depth, name, canHoldContent }) => ({ depth, name, canHoldContent })) ?? [{ depth: 1, name: 'Chapter', canHoldContent: false }, { depth: 2, name: 'Topic', canHoldContent: true }]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    const body = { name: data.get('name'), ...(schema ? {} : { code: data.get('code') }), description: String(data.get('description') ?? '') || undefined, levels };
    const response = await fetch(schema ? `/api/curriculum-schemas/${schema.id}` : '/api/curriculum-schemas', { method: schema ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    setBusy(false);
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      setError(result.message ?? 'Could not save schema');
      return;
    }
    router.refresh();
    onDone?.();
  }

  return (
    <Card className="p-5">
      <form onSubmit={submit} className="grid gap-4">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="field-label">Name<input name="name" required defaultValue={schema?.name} className="field" /></label>
          <label className="field-label">Code<input name="code" required={!schema} disabled={Boolean(schema)} defaultValue={schema?.code} pattern="[a-z0-9]+(-[a-z0-9]+)*" className="field font-mono disabled:bg-surface-canvas" /></label>
        </div>
        <label className="field-label">Description<textarea name="description" rows={3} defaultValue={schema?.description ?? ''} className="field resize-y" /></label>
        <div><h3 className="mb-2 text-sm font-semibold text-ink">Levels, shallowest first</h3><LevelListEditor levels={levels} onChange={setLevels} /></div>
        {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-status-danger">{error}</p> : null}
        <Button type="submit" disabled={busy} className="w-fit">{busy ? 'Saving…' : schema ? 'Save schema' : 'Create schema'}</Button>
      </form>
    </Card>
  );
}
