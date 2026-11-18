'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AcademicYear } from '@smart-teacher/shared-types';
import { Button } from '@/components/ui/button';
import { longDateLabel } from './calendar-dates';

export function AcademicYearRow({ year }: { year: AcademicYear }) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [label, setLabel] = useState(year.label);
  const [startDate, setStartDate] = useState(year.startDate);
  const [endDate, setEndDate] = useState(year.endDate);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function cancel() {
    setLabel(year.label);
    setStartDate(year.startDate);
    setEndDate(year.endDate);
    setError(null);
    setIsEditing(false);
  }

  // Both can be refused with a 409 (entries outside the new dates, or calendars still
  // using the year); the API's reason is shown as-is.
  async function send(method: 'PATCH' | 'DELETE') {
    if (method === 'DELETE' && !window.confirm(`Delete academic year ${year.label}?`)) {
      return;
    }
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/academic-years/${year.id}`, {
      method,
      headers: method === 'PATCH' ? { 'Content-Type': 'application/json' } : undefined,
      body: method === 'PATCH' ? JSON.stringify({ label, startDate, endDate }) : undefined,
    });
    setBusy(false);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.message ?? 'Request failed');
      return;
    }
    setIsEditing(false);
    router.refresh();
  }

  return (
    <tr className="border-b border-surface-border last:border-0 align-top">
      {isEditing ? (
        <>
          <td className="px-4 py-3">
            <input value={label} onChange={(event) => setLabel(event.target.value)} className="field" aria-label="Label" />
          </td>
          <td className="px-4 py-3">
            <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="field" aria-label="Starts" />
          </td>
          <td className="px-4 py-3">
            <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="field" aria-label="Ends" />
          </td>
        </>
      ) : (
        <>
          <td className="px-4 py-3 font-medium text-ink">{year.label}</td>
          <td className="px-4 py-3 text-ink-muted">{longDateLabel(year.startDate)}</td>
          <td className="px-4 py-3 text-ink-muted">{longDateLabel(year.endDate)}</td>
        </>
      )}
      <td className="px-4 py-3">
        <div className="flex flex-col items-end gap-1">
          <div className="flex justify-end gap-2">
            {isEditing ? (
              <>
                <Button disabled={busy} onClick={() => send('PATCH')}>Save</Button>
                <Button variant="ghost" disabled={busy} onClick={cancel}>Cancel</Button>
              </>
            ) : (
              <>
                <Button variant="ghost" disabled={busy} onClick={() => setIsEditing(true)}>Edit</Button>
                <Button variant="ghost" disabled={busy} onClick={() => send('DELETE')}>Delete</Button>
              </>
            )}
          </div>
          {error ? <p className="max-w-xs text-right text-xs text-status-danger">{error}</p> : null}
        </div>
      </td>
    </tr>
  );
}
