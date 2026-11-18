'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AcademicCalendarEntry } from '@smart-teacher/shared-types';
import type { CalendarKind } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { dayLabel } from '../../_components/calendar-dates';

export function CalendarEntryRow({
  kind,
  calendarId,
  entry,
  minDate,
  maxDate,
}: {
  kind: CalendarKind;
  calendarId: string;
  entry: AcademicCalendarEntry;
  minDate: string;
  maxDate: string;
}) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [date, setDate] = useState(entry.date);
  const [title, setTitle] = useState(entry.title);
  const [description, setDescription] = useState(entry.description ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const url = `/api/calendars/${kind}/${calendarId}/entries/${entry.id}`;

  function cancel() {
    setDate(entry.date);
    setTitle(entry.title);
    setDescription(entry.description ?? '');
    setError(null);
    setIsEditing(false);
  }

  async function save() {
    setBusy(true);
    setError(null);
    const trimmed = description.trim();
    const response = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      // null clears the notes; the API treats an omitted field as "unchanged".
      body: JSON.stringify({ date, title, description: trimmed === '' ? null : trimmed }),
    });
    setBusy(false);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.message ?? 'Failed to save the entry');
      return;
    }
    setIsEditing(false);
    router.refresh();
  }

  async function remove() {
    if (!window.confirm(`Remove "${entry.title}"?`)) {
      return;
    }
    setBusy(true);
    setError(null);
    const response = await fetch(url, { method: 'DELETE' });
    setBusy(false);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.message ?? 'Failed to remove the entry');
      return;
    }
    router.refresh();
  }

  if (isEditing) {
    return (
      <li className="grid gap-3 px-4 py-3">
        <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
          <input type="date" value={date} min={minDate} max={maxDate} onChange={(event) => setDate(event.target.value)} className="field" aria-label="Date" />
          <input value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} className="field" aria-label="Lesson" />
        </div>
        <textarea value={description} maxLength={2000} rows={2} onChange={(event) => setDescription(event.target.value)} className="field" aria-label="Notes" />
        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={busy} onClick={save}>Save</Button>
          <Button variant="ghost" disabled={busy} onClick={cancel}>Cancel</Button>
          {error ? <p className="text-sm text-status-danger">{error}</p> : null}
        </div>
      </li>
    );
  }

  return (
    <li className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{dayLabel(entry.date)}</p>
        <p className="font-medium text-ink">{entry.title}</p>
        {entry.description ? <p className="mt-0.5 whitespace-pre-line text-sm text-ink-muted">{entry.description}</p> : null}
        {error ? <p className="mt-1 text-sm text-status-danger">{error}</p> : null}
      </div>
      <div className="flex gap-2">
        <Button variant="ghost" disabled={busy} onClick={() => setIsEditing(true)}>Edit</Button>
        <Button variant="ghost" disabled={busy} onClick={remove}>Remove</Button>
      </div>
    </li>
  );
}
