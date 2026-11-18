'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

// Opting out hides every planned lesson for the year from teachers and students; it
// deletes nothing, so turning it back on restores the calendar exactly as it was.
export function CalendarSettingToggle({
  academicYearId,
  yearLabel,
  isEnabled,
}: {
  academicYearId: string;
  yearLabel: string;
  isEnabled: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    if (
      isEnabled &&
      !window.confirm(`Stop using the academic calendar for ${yearLabel}? Teachers and students will see an empty calendar.`)
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/academic-calendar-settings/${academicYearId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isEnabled: !isEnabled }),
    });
    setBusy(false);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.message ?? 'Failed to update the setting');
      return;
    }
    router.refresh();
  }

  return (
    <div
      className={
        isEnabled
          ? 'flex flex-wrap items-center justify-between gap-3 rounded-card border border-green-200 bg-green-50 px-4 py-3'
          : 'flex flex-wrap items-center justify-between gap-3 rounded-card border border-amber-200 bg-amber-50 px-4 py-3'
      }
    >
      <div className="text-sm">
        <p className="font-semibold text-ink">
          {isEnabled ? `Academic calendar is on for ${yearLabel}` : `Academic calendar is off for ${yearLabel}`}
        </p>
        <p className="text-ink-muted">
          {isEnabled
            ? 'Teachers and students see the planned lessons below.'
            : 'Teachers and students see an empty calendar. Your plans are kept.'}
        </p>
        {error ? <p className="mt-1 text-status-danger">{error}</p> : null}
      </div>
      <Button variant={isEnabled ? 'secondary' : 'primary'} disabled={busy} onClick={toggle}>
        {isEnabled ? 'Turn off' : 'Turn on'}
      </Button>
    </div>
  );
}
