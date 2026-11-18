'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

export function AcademicYearForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setError(null);
    const response = await fetch('/api/academic-years', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        label: data.get('label'),
        startDate: data.get('startDate'),
        endDate: data.get('endDate'),
      }),
    });
    setBusy(false);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.message ?? 'Failed to create academic year');
      return;
    }
    form.reset();
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
        <label className="field-label">
          Label
          <input name="label" required maxLength={50} placeholder="2026-2027" className="field" />
        </label>
        <label className="field-label">
          Starts
          <input name="startDate" type="date" required className="field" />
        </label>
        <label className="field-label">
          Ends
          <input name="endDate" type="date" required className="field" />
        </label>
        <Button type="submit" disabled={busy}>
          {busy ? 'Adding…' : 'Add year'}
        </Button>
      </div>
      {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-status-danger">{error}</p> : null}
    </form>
  );
}
