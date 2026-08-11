'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CurriculumSchema, GradeLevel, Subject } from '@smart-teacher/shared-types';

export function CreateCurriculumForm({
  gradeLevels,
  subjects,
  schemas,
}: {
  gradeLevels: GradeLevel[];
  subjects: Subject[];
  schemas: CurriculumSchema[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    const response = await fetch('/api/curricula', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gradeLevelId: data.get('gradeLevelId'),
        subjectId: data.get('subjectId'),
        schemaId: data.get('schemaId'),
        audience: data.get('audience'),
      }),
    });
    setBusy(false);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.message ?? 'Failed to create curriculum');
      return;
    }
    event.currentTarget.reset();
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="rounded-lg border bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-lg font-medium">Create curriculum</h2>
      <div className="grid gap-4 md:grid-cols-4">
        <label className="grid gap-1 text-sm">
          Audience
          <select name="audience" required className="rounded border px-3 py-2">
            <option value="STUDENT">Students</option>
            <option value="TEACHER">Teachers</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          Grade level
          <select name="gradeLevelId" required className="rounded border px-3 py-2">
            <option value="">Choose grade</option>
            {gradeLevels.map((grade) => <option key={grade.id} value={grade.id}>{grade.name}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          Subject
          <select name="subjectId" required className="rounded border px-3 py-2">
            <option value="">Choose subject</option>
            {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          Structure
          <select name="schemaId" required className="rounded border px-3 py-2">
            <option value="">Choose schema</option>
            {schemas.map((schema) => <option key={schema.id} value={schema.id}>{schema.name}</option>)}
          </select>
        </label>
      </div>
      {schemas.length === 0 && <p className="mt-3 text-sm text-amber-700">Create a level schema before creating a curriculum.</p>}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <button disabled={busy || schemas.length === 0} className="mt-4 rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
        {busy ? 'Creating…' : 'Create curriculum'}
      </button>
    </form>
  );
}
