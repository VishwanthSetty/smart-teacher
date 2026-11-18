'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CalendarKind } from '@/lib/api-client';
import { Button } from '@/components/ui/button';

export function CalendarEntryForm({
  kind,
  calendarId,
  minDate,
  maxDate,
}: {
  kind: CalendarKind;
  calendarId: string;
  minDate: string;
  maxDate: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const description = String(data.get('description') ?? '').trim();
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/calendars/${kind}/${calendarId}/entries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: data.get('date'),
        title: data.get('title'),
        ...(description ? { description } : {}),
      }),
    });
    setBusy(false);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.message ?? 'Failed to add the entry');
      return;
    }
    // Keep the date: planning usually runs day after day, and the next entry is often
    // the same day's second period.
    const title = form.elements.namedItem('title');
    const details = form.elements.namedItem('description');
    if (title instanceof HTMLInputElement) title.value = '';
    if (details instanceof HTMLTextAreaElement) details.value = '';
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
        <label className="field-label">
          Date
          <input name="date" type="date" required min={minDate} max={maxDate} className="field" />
        </label>
        <label className="field-label">
          Lesson
          <input name="title" required maxLength={200} placeholder="Chapter 3 — Introduction to fractions" className="field" />
        </label>
      </div>
      <label className="field-label">
        Notes (optional)
        <textarea name="description" maxLength={2000} rows={2} className="field" />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy}>
          {busy ? 'Adding…' : 'Add to calendar'}
        </Button>
        {error ? <p className="text-sm text-status-danger">{error}</p> : null}
      </div>
    </form>
  );
}
