import Link from 'next/link';
import type { AcademicYear } from '@smart-teacher/shared-types';
import { apiListActiveSubjects, apiListGradeLevels, apiListPlatformCalendars } from '@/lib/api-client';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { AcademicYearForm } from './academic-year-form';
import { AcademicYearRow } from './academic-year-row';
import { CreateDefaultCalendarForm } from './create-default-calendar-form';
import { NoAcademicYears } from './no-academic-years';
import { QuerySelect } from './query-select';

// SUPER_ADMIN: the academic years every calendar hangs off, and the default calendar per
// class and subject that entitled schools see unless they publish their own.
export async function PlatformCalendarAdmin({
  token,
  years,
  year,
}: {
  token: string;
  years: AcademicYear[];
  year: AcademicYear | null;
}) {
  const [calendars, gradeLevels, subjects] = year
    ? await Promise.all([
        apiListPlatformCalendars(token, { academicYearId: year.id }),
        apiListGradeLevels(token),
        apiListActiveSubjects(token),
      ])
    : [[], [], []];

  return (
    <div className="grid gap-6">
      <Card className="grid gap-4 p-6">
        <div>
          <h2 className="font-semibold text-ink">Academic years</h2>
          <p className="text-sm text-ink-muted">Every calendar entry must fall between a year&apos;s start and end dates.</p>
        </div>
        <AcademicYearForm />
        {years.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead className="border-b border-surface-border text-ink-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Label</th>
                  <th className="px-4 py-2 font-medium">Starts</th>
                  <th className="px-4 py-2 font-medium">Ends</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {years.map((item) => (
                  <AcademicYearRow key={item.id} year={item} />
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>

      {year ? (
        <Card className="grid gap-4 p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="font-semibold text-ink">Default calendars</h2>
              <p className="text-sm text-ink-muted">
                Shown to every school entitled to the class and subject, once published.
              </p>
            </div>
            <QuerySelect
              label="Academic year"
              param="year"
              value={year.id}
              options={years.map((item) => ({ value: item.id, label: item.label }))}
            />
          </div>
          <CreateDefaultCalendarForm academicYearId={year.id} gradeLevels={gradeLevels} subjects={subjects} />
          {calendars.length === 0 ? (
            <p className="rounded-lg bg-slate-50 px-4 py-6 text-center text-sm text-ink-muted">
              No default calendars for {year.label} yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[36rem] text-left text-sm">
                <thead className="border-b border-surface-border text-ink-muted">
                  <tr>
                    <th className="px-4 py-2 font-medium">Class</th>
                    <th className="px-4 py-2 font-medium">Subject</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium">Planned days</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {calendars.map((calendar) => (
                    <tr key={calendar.id} className="border-b border-surface-border last:border-0">
                      <td className="px-4 py-3 font-medium text-ink">{calendar.gradeLevel.name}</td>
                      <td className="px-4 py-3">{calendar.subject.name}</td>
                      <td className="px-4 py-3"><StatusBadge status={calendar.status} /></td>
                      <td className="px-4 py-3 text-ink-muted">{calendar.entryCount}</td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/dashboard/academic-calendar/${calendar.id}`} className="font-medium text-brand-blue hover:text-brand-navy">
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : (
        <NoAcademicYears canCreate />
      )}
    </div>
  );
}
