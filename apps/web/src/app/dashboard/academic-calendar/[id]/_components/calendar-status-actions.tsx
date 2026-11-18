'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AcademicCalendarStatus } from '@smart-teacher/shared-types';
import type { CalendarKind } from '@/lib/api-client';
import { Button } from '@/components/ui/button';

export function CalendarStatusActions({
  kind,
  id,
  status,
  hasEntries,
}: {
  kind: CalendarKind;
  id: string;
  status: AcademicCalendarStatus;
  hasEntries: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isPublished = status === AcademicCalendarStatus.PUBLISHED;

  async function setPublished(next: boolean) {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/calendars/${kind}/${id}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isPublished: next }),
    });
    setBusy(false);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.message ?? 'Could not change the status');
      return;
    }
    router.refresh();
  }

  // For a school, deleting is "go back to the default"; for the platform it removes the
  // default from every school that was not overriding it.
  async function remove() {
    const message =
      kind === 'school'
        ? 'Delete this calendar? Teachers and students will see the default plan again, if there is one.'
        : 'Delete this default calendar? Every school using it will see an empty calendar for this class and subject.';
    if (!window.confirm(message)) {
      return;
    }
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/calendars/${kind}/${id}`, { method: 'DELETE' });
    setBusy(false);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.message ?? 'Could not delete the calendar');
      return;
    }
    router.push('/dashboard/academic-calendar');
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap justify-end gap-2">
        {isPublished ? (
          <Button variant="secondary" disabled={busy} onClick={() => setPublished(false)}>
            Unpublish
          </Button>
        ) : (
          <Button
            disabled={busy || !hasEntries}
            title={hasEntries ? undefined : 'Add at least one entry first'}
            onClick={() => setPublished(true)}
          >
            Publish
          </Button>
        )}
        <Button variant="ghost" disabled={busy} onClick={remove}>
          {kind === 'school' ? 'Delete and use default' : 'Delete'}
        </Button>
      </div>
      {error ? <p className="max-w-sm text-right text-sm text-status-danger">{error}</p> : null}
    </div>
  );
}
