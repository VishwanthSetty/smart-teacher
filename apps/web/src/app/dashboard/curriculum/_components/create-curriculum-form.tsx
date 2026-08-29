'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Layers3 } from 'lucide-react';
import type { CurriculumSchema, GradeLevel, Subject } from '@smart-teacher/shared-types';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export function CreateCurriculumForm({ gradeLevels, subjects, schemas }: { gradeLevels: GradeLevel[]; subjects: Subject[]; schemas: CurriculumSchema[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    setError(null);
    const data = new FormData(form);
    const response = await fetch('/api/curricula', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gradeLevelId: data.get('gradeLevelId'), subjectId: data.get('subjectId'), schemaId: data.get('schemaId'), audience: data.get('audience') }),
    });
    setBusy(false);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.message ?? 'Failed to create curriculum');
      return;
    }
    form.reset();
    router.refresh();
  }

  return (
    <Card className="p-6">
      <form onSubmit={submit}>
        <div className="mb-5 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-tint text-brand-blue"><Layers3 className="h-5 w-5" /></span>
          <div><h2 className="font-semibold text-ink">Create curriculum</h2><p className="text-sm text-ink-muted">Choose the audience, subject, and reusable content structure.</p></div>
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          <label className="field-label">Audience<select name="audience" required className="field"><option value="STUDENT">Students</option><option value="TEACHER">Teachers</option></select></label>
          <label className="field-label">Grade level<select name="gradeLevelId" required className="field"><option value="">Choose grade</option>{gradeLevels.map((grade) => <option key={grade.id} value={grade.id}>{grade.name}</option>)}</select></label>
          <label className="field-label">Subject<select name="subjectId" required className="field"><option value="">Choose subject</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label>
          <label className="field-label">Structure<select name="schemaId" required className="field"><option value="">Choose schema</option>{schemas.map((schema) => <option key={schema.id} value={schema.id}>{schema.name}</option>)}</select></label>
        </div>
        {schemas.length === 0 ? <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Create a level schema before creating a curriculum.</p> : null}
        {error ? <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-status-danger">{error}</p> : null}
        <Button type="submit" disabled={busy || schemas.length === 0} className="mt-5">{busy ? 'Creating…' : 'Create curriculum'}</Button>
      </form>
    </Card>
  );
}
