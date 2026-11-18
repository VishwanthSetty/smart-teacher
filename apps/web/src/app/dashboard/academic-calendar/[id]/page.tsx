import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Role, type AcademicCalendarEntry } from '@smart-teacher/shared-types';
import { ApiError, apiGetCalendar, type CalendarKind } from '@/lib/api-client';
import { getAccessToken, requireUser } from '@/lib/session';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/badge';
import { longDateLabel, monthLabel } from '../_components/calendar-dates';
import { CalendarEntryForm } from './_components/calendar-entry-form';
import { CalendarEntryRow } from './_components/calendar-entry-row';
import { CalendarImport } from './_components/calendar-import';
import { CalendarStatusActions } from './_components/calendar-status-actions';

// The one editor for both kinds of calendar. The caller's role decides which: a
// SUPER_ADMIN only ever edits platform defaults, a SCHOOL_ADMIN only its own school's.
const KIND_BY_ROLE: Partial<Record<Role, CalendarKind>> = {
  [Role.SUPER_ADMIN]: 'platform',
  [Role.SCHOOL_ADMIN]: 'school',
};

export default async function AcademicCalendarEditorPage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  const kind = KIND_BY_ROLE[user.role];
  if (!kind) {
    redirect('/dashboard/forbidden');
  }

  const calendar = await apiGetCalendar(getAccessToken() ?? '', kind, params.id).catch((error: unknown) => {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  });
  if (!calendar) {
    notFound();
  }

  const byMonth = new Map<string, AcademicCalendarEntry[]>();
  for (const entry of calendar.entries) {
    const month = entry.date.slice(0, 7);
    byMonth.set(month, [...(byMonth.get(month) ?? []), entry]);
  }
  const { startDate, endDate } = calendar.academicYear;

  return (
    <div className="grid gap-6">
      <Link
        href={`/dashboard/academic-calendar?year=${calendar.academicYear.id}`}
        className="text-sm font-medium text-brand-blue hover:text-brand-navy"
      >
        ← Academic calendar
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <PageHeader
            title={`${calendar.gradeLevel.name} · ${calendar.subject.name}`}
            description={`${kind === 'platform' ? 'Default plan' : 'Your school’s plan'} for ${calendar.academicYear.label} (${longDateLabel(startDate)} – ${longDateLabel(endDate)})`}
          />
          <StatusBadge status={calendar.status} />
        </div>
        <CalendarStatusActions
          kind={kind}
          id={calendar.id}
          status={calendar.status}
          hasEntries={calendar.entries.length > 0}
        />
      </div>

      <p className="rounded-card border border-brand-soft bg-brand-tint px-4 py-3 text-sm text-brand-navy">
        {kind === 'platform'
          ? 'Once published, every school entitled to this class and subject sees this plan, unless it publishes its own.'
          : 'Once published, your teachers and students see this plan instead of the default.'}
      </p>

      <Card className="grid gap-4 p-6">
        <h2 className="font-semibold text-ink">Plan a lesson</h2>
        <CalendarEntryForm kind={kind} calendarId={calendar.id} minDate={startDate} maxDate={endDate} />
      </Card>

      <Card className="grid gap-4 p-6">
        <div>
          <h2 className="font-semibold text-ink">Upload from Excel</h2>
          <p className="text-sm text-ink-muted">Plan the whole year in a spreadsheet, preview it, then import it in one go.</p>
        </div>
        <CalendarImport kind={kind} calendarId={calendar.id} />
      </Card>

      {calendar.entries.length === 0 ? (
        <p className="rounded-card border border-dashed border-surface-border px-4 py-10 text-center text-sm text-ink-muted">
          No lessons planned yet.
        </p>
      ) : (
        [...byMonth.entries()].map(([month, entries]) => (
          <Card key={month} className="overflow-hidden">
            <h2 className="border-b border-surface-border bg-slate-50 px-4 py-2 text-sm font-semibold text-ink">
              {monthLabel(month)} <span className="font-normal text-ink-muted">· {entries.length}</span>
            </h2>
            <ul className="divide-y divide-surface-border">
              {entries.map((entry) => (
                <CalendarEntryRow
                  key={entry.id}
                  kind={kind}
                  calendarId={calendar.id}
                  entry={entry}
                  minDate={startDate}
                  maxDate={endDate}
                />
              ))}
            </ul>
          </Card>
        ))
      )}
    </div>
  );
}
