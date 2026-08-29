'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CurriculumSchema } from '@smart-teacher/shared-types';
import { SchemaForm } from './schema-form';
import { Button } from '@/components/ui/button';

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
    <div className="flex flex-wrap gap-2"><Button variant="secondary" className="h-9 px-3" onClick={() => setEditing(!editing)}>{editing ? 'Cancel edit' : 'Edit'}</Button><Button variant="ghost" className="h-9 px-3" onClick={clone}>Clone</Button><Button variant="ghost" className="h-9 px-3 text-status-danger hover:bg-red-50 hover:text-status-danger" onClick={remove} disabled={schema.curriculumCount > 0} title={schema.curriculumCount > 0 ? 'This schema is in use' : undefined}>Delete</Button></div>
    {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-status-danger">{error}</p>}
    {editing && <SchemaForm schema={schema} onDone={() => setEditing(false)} />}
  </div>;
}
