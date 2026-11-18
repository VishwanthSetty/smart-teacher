'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { GradeLevel, Subject } from '@smart-teacher/shared-types';
import { Button } from '@/components/ui/button';

export function CreateDefaultCalendarForm({
  academicYearId,
  gradeLevels,
  subjects,
}: {
  academicYearId: string;
  gradeLevels: GradeLevel[];
  subjects: Subject[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    const response = await fetch('/api/calendars/platform', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        academicYearId,
        gradeLevelId: data.get('gradeLevelId'),
        subjectId: data.get('subjectId'),
      }),
    });
    setBusy(false);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.message ?? 'Failed to create calendar');
      return;
    }
    const created: { id: string } = await response.json();
    router.push(`/dashboard/academic-calendar/${created.id}`);
  }

  return (
    <form onSubmit={submit} className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="field-label">
          Class
          <select name="gradeLevelId" required className="field" defaultValue="">
            <option value="" disabled>Choose a class</option>
            {gradeLevels.map((grade) => (
              <option key={grade.id} value={grade.id}>{grade.name}</option>
            ))}
          </select>
        </label>
        <label className="field-label">
          Subject
          <select name="subjectId" required className="field" defaultValue="">
            <option value="" disabled>Choose a subject</option>
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>{subject.name}</option>
            ))}
          </select>
        </label>
        <Button type="submit" disabled={busy}>
          {busy ? 'Creating…' : 'Create calendar'}
        </Button>
      </div>
      {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-status-danger">{error}</p> : null}
    </form>
  );
}
