import Link from 'next/link';
import { AcademicCalendarSource, AcademicCalendarStatus, type AcademicYear } from '@smart-teacher/shared-types';
import { apiGetSchoolCalendarOverview } from '@/lib/api-client';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { CalendarSettingToggle } from './calendar-setting-toggle';
import { QuerySelect } from './query-select';
import { SchoolCalendarRowActions } from './school-calendar-row-actions';

// SCHOOL_ADMIN: every class and subject the school is entitled to, which plan each one
// shows, and the per-year opt-in.
export async function SchoolCalendarAdmin({
  token,
  years,
  year,
}: {
  token: string;
  years: AcademicYear[];
  year: AcademicYear;
}) {
  const overview = await apiGetSchoolCalendarOverview(token, year.id);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <QuerySelect
          label="Academic year"
          param="year"
          value={year.id}
          options={years.map((item) => ({ value: item.id, label: item.label }))}
        />
        <Link
          href={`/dashboard/academic-calendar?view=calendar&year=${year.id}`}
          className="text-sm font-medium text-brand-blue hover:text-brand-navy"
        >
          See what teachers and students see →
        </Link>
      </div>

      <CalendarSettingToggle academicYearId={year.id} yearLabel={year.label} isEnabled={overview.isEnabled} />

      <Card className="grid gap-4 p-6">
        <div>
          <h2 className="font-semibold text-ink">Plans by class and subject</h2>
          <p className="text-sm text-ink-muted">
            Your own calendar replaces the default for that class and subject once you publish it.
          </p>
        </div>
        {overview.rows.length === 0 ? (
          <p className="rounded-lg bg-slate-50 px-4 py-6 text-center text-sm text-ink-muted">
            Your school has no classes and subjects with licensed content yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] text-left text-sm">
              <thead className="border-b border-surface-border text-ink-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Class</th>
                  <th className="px-4 py-2 font-medium">Subject</th>
                  <th className="px-4 py-2 font-medium">Default plan</th>
                  <th className="px-4 py-2 font-medium">Your plan</th>
                  <th className="px-4 py-2 font-medium">Showing</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {overview.rows.map((row) => (
                  <tr key={`${row.gradeLevel.id}:${row.subject.id}`} className="border-b border-surface-border last:border-0 align-top">
                    <td className="px-4 py-3 font-medium text-ink">{row.gradeLevel.name}</td>
                    <td className="px-4 py-3">{row.subject.name}</td>
                    <td className="px-4 py-3 text-ink-muted">
                      {row.defaultCalendar ? `${row.defaultCalendar.entryCount} planned days` : 'None'}
                    </td>
                    <td className="px-4 py-3">
                      {row.schoolCalendar ? (
                        <span className="flex items-center gap-2">
                          <StatusBadge status={row.schoolCalendar.status} />
                          <span className="text-ink-muted">{row.schoolCalendar.entryCount} days</span>
                        </span>
                      ) : (
                        <span className="text-ink-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <ShowingBadge row={row} />
                    </td>
                    <td className="px-4 py-3">
                      <SchoolCalendarRowActions academicYearId={year.id} row={row} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function ShowingBadge({ row }: { row: { effectiveSource: AcademicCalendarSource | null; schoolCalendar: { status: AcademicCalendarStatus } | null } }) {
  if (row.effectiveSource === AcademicCalendarSource.SCHOOL) {
    return <Badge variant="success">Your plan</Badge>;
  }
  if (row.effectiveSource === AcademicCalendarSource.PLATFORM) {
    return (
      <span className="flex flex-col gap-1">
        <Badge variant="info">Default</Badge>
        {row.schoolCalendar?.status === AcademicCalendarStatus.DRAFT ? (
          <span className="text-xs text-ink-muted">Publish yours to replace it</span>
        ) : null}
      </span>
    );
  }
  return <Badge variant="neutral">Nothing yet</Badge>;
}
