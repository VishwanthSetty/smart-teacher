'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { SchoolCalendarOverviewRow } from '@smart-teacher/shared-types';
import { Button } from '@/components/ui/button';

export function SchoolCalendarRowActions({
  academicYearId,
  row,
}: {
  academicYearId: string;
  row: SchoolCalendarOverviewRow;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(copyFromDefault: boolean) {
    setBusy(true);
    setError(null);
    const response = await fetch('/api/calendars/school', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        academicYearId,
        gradeLevelId: row.gradeLevel.id,
        subjectId: row.subject.id,
        copyFromDefault,
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

  async function revert(id: string) {
    const message = row.defaultCalendar
      ? `Delete your ${row.gradeLevel.name} ${row.subject.name} calendar and go back to the default plan?`
      : `Delete your ${row.gradeLevel.name} ${row.subject.name} calendar?`;
    if (!window.confirm(message)) {
      return;
    }
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/calendars/school/${id}`, { method: 'DELETE' });
    setBusy(false);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.message ?? 'Failed to delete calendar');
      return;
    }
    router.refresh();
  }

  const own = row.schoolCalendar;
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap justify-end gap-2">
        {own ? (
          <>
            <Link href={`/dashboard/academic-calendar/${own.id}`} className="inline-flex h-10 items-center rounded-lg px-3 text-sm font-medium text-brand-blue hover:bg-brand-tint">
              Edit
            </Link>
            <Button variant="ghost" disabled={busy} onClick={() => revert(own.id)}>
              {row.defaultCalendar ? 'Use default' : 'Delete'}
            </Button>
          </>
        ) : (
          <>
            {row.defaultCalendar ? (
              <Button variant="secondary" disabled={busy} onClick={() => create(true)}>
                Customise default
              </Button>
            ) : null}
            <Button variant="ghost" disabled={busy} onClick={() => create(false)}>
              Start blank
            </Button>
          </>
        )}
      </div>
      {error ? <p className="max-w-xs text-right text-xs text-status-danger">{error}</p> : null}
    </div>
  );
}
