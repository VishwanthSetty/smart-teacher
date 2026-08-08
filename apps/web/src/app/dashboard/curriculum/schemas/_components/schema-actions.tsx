'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CurriculumSchema } from '@smart-teacher/shared-types';
import { SchemaForm } from './schema-form';

export function SchemaActions({ schema }: { schema: CurriculumSchema }) {
  const router = useRouter(); const [editing, setEditing] = useState(false); const [error, setError] = useState<string | null>(null);
  async function remove() {
    if (!confirm(`Delete ${schema.name}?`)) return;
    const response = await fetch(`/api/curriculum-schemas/${schema.id}`, { method: 'DELETE' });
    if (!response.ok) { const body = await response.json().catch(() => ({})); setError(body.message ?? 'Could not delete schema'); return; }
    router.refresh();
  }
  async function clone() {
    const name = prompt('Name for the cloned schema', `${schema.name} copy`); if (!name) return;
    const code = prompt('Permanent code for the clone'); if (!code) return;
    const response = await fetch(`/api/curriculum-schemas/${schema.id}/clone`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, code }) });
    if (!response.ok) { const body = await response.json().catch(() => ({})); setError(body.message ?? 'Could not clone schema'); return; }
    router.refresh();
  }
  return <div className="mt-4 grid gap-3">
    <div className="flex gap-2"><button onClick={() => setEditing(!editing)} className="rounded border px-3 py-1.5 text-sm">{editing ? 'Cancel edit' : 'Edit'}</button><button onClick={clone} className="rounded border px-3 py-1.5 text-sm">Clone</button><button onClick={remove} disabled={schema.curriculumCount > 0} title={schema.curriculumCount > 0 ? 'This schema is in use' : undefined} className="rounded border border-red-200 px-3 py-1.5 text-sm text-red-700 disabled:opacity-40">Delete</button></div>
    {error && <p className="text-sm text-red-600">{error}</p>}
    {editing && <SchemaForm schema={schema} onDone={() => setEditing(false)} />}
  </div>;
}
