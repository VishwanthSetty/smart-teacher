import Link from 'next/link';
import type { ReactNode } from 'react';
import clsx from 'clsx';
import { ChevronLeft, ChevronRight, Info } from 'lucide-react';
import type { AcademicCalendarViewEntry, AcademicYear, CalendarPair } from '@smart-teacher/shared-types';
import { apiListCalendarPairs, apiViewAcademicCalendar } from '@/lib/api-client';
import { Card } from '@/components/ui/card';
import {
  WEEKDAYS,
  dayLabel,
  monthBounds,
  monthGrid,
  monthLabel,
  pickMonth,
  shiftMonth,
  todayIso,
} from './calendar-dates';
import { QuerySelect } from './query-select';

const BASE = '/dashboard/academic-calendar';

// Fixed classes rather than computed ones, so Tailwind's scanner sees every colour.
const SUBJECT_COLOURS = [
  'border-blue-200 bg-blue-50 text-blue-900',
  'border-emerald-200 bg-emerald-50 text-emerald-900',
  'border-amber-200 bg-amber-50 text-amber-900',
  'border-violet-200 bg-violet-50 text-violet-900',
  'border-rose-200 bg-rose-50 text-rose-900',
  'border-cyan-200 bg-cyan-50 text-cyan-900',
] as const;

export interface MonthViewParams {
  month?: string;
  class?: string;
  view?: string;
}

// The read-only calendar: teachers and students (and a school admin previewing) see the
// effective plan for each class and subject they may view — the school's own where it
// published one, the platform default otherwise.
export async function CalendarMonthView({
  token,
  years,
  year,
  params,
}: {
  token: string;
  years: AcademicYear[];
  year: AcademicYear;
  params: MonthViewParams;
}) {
  const month = pickMonth(year, params.month);
  const { from, to } = monthBounds(month);
  const pairs = await apiListCalendarPairs(token);
  const selected = pairs.find((pair) => pairKey(pair) === params.class);

  const view = await apiViewAcademicCalendar(token, {
    academicYearId: year.id,
    from,
    to,
    gradeLevelId: selected?.gradeLevel.id,
    subjectId: selected?.subject.id,
  });

  const byDate = new Map<string, AcademicCalendarViewEntry[]>();
  for (const entry of view.entries) {
    byDate.set(entry.date, [...(byDate.get(entry.date) ?? []), entry]);
  }
  const colourOf = (entry: AcademicCalendarViewEntry): string => {
    const index = pairs.findIndex((pair) => pair.subject.id === entry.subject.id);
    return SUBJECT_COLOURS[(index < 0 ? 0 : index) % SUBJECT_COLOURS.length];
  };
  // Several grades only appear together for a teacher or admin; a student's view is
  // one class, so repeating the grade on every entry would be noise.
  const showsGrade = new Set(pairs.map((pair) => pair.gradeLevel.id)).size > 1;

  const firstMonth = year.startDate.slice(0, 7);
  const lastMonth = year.endDate.slice(0, 7);
  const linkTo = (target: string): string => {
    const next = new URLSearchParams();
    next.set('year', year.id);
    next.set('month', target);
    if (params.class) next.set('class', params.class);
    if (params.view) next.set('view', params.view);
    return `${BASE}?${next.toString()}`;
  };
  const today = todayIso();

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <QuerySelect
          label="Academic year"
          param="year"
          value={year.id}
          options={years.map((item) => ({ value: item.id, label: item.label }))}
          resets={['month']}
        />
        {pairs.length > 1 ? (
          <QuerySelect
            label="Class and subject"
            param="class"
            value={selected ? pairKey(selected) : ''}
            options={[{ value: '', label: 'All' }, ...pairs.map((pair) => ({ value: pairKey(pair), label: pairLabel(pair) }))]}
          />
        ) : null}
      </div>

      {!view.isEnabled ? (
        <Notice>Your school is not using the academic calendar for {year.label}.</Notice>
      ) : pairs.length === 0 ? (
        <Notice>There are no classes or subjects to show yet.</Notice>
      ) : null}

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b border-surface-border px-4 py-3">
          <MonthLink href={month > firstMonth ? linkTo(shiftMonth(month, -1)) : null} label="Previous month">
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </MonthLink>
          <h2 className="text-base font-semibold text-ink">{monthLabel(month)}</h2>
          <MonthLink href={month < lastMonth ? linkTo(shiftMonth(month, 1)) : null} label="Next month">
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </MonthLink>
        </div>

        {/* Month grid from md up; a day list below it, where seven columns cannot fit text. */}
        <div className="hidden md:block">
          <div className="grid grid-cols-7 border-b border-surface-border bg-slate-50 text-xs font-medium uppercase tracking-wide text-ink-muted">
            {WEEKDAYS.map((weekday) => (
              <div key={weekday} className="px-2 py-2">{weekday}</div>
            ))}
          </div>
          {monthGrid(month).map((week, index) => (
            <div key={index} className="grid grid-cols-7 border-b border-surface-border last:border-0">
              {week.map((date, dayIndex) => (
                <div
                  key={date ?? `blank-${dayIndex}`}
                  className={clsx(
                    'min-h-28 border-r border-surface-border p-1.5 last:border-r-0',
                    date === null && 'bg-slate-50',
                    date !== null && (date < year.startDate || date > year.endDate) && 'bg-slate-50 text-ink-muted',
                  )}
                >
                  {date ? (
                    <>
                      <span
                        className={clsx(
                          'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs',
                          date === today ? 'bg-brand-blue font-semibold text-white' : 'text-ink-muted',
                        )}
                      >
                        {Number(date.slice(8))}
                      </span>
                      <ul className="mt-1 grid gap-1">
                        {(byDate.get(date) ?? []).map((entry) => (
                          <li
                            key={entry.id}
                            title={entry.description ?? entry.title}
                            className={clsx('rounded-md border px-1.5 py-1 text-xs leading-snug', colourOf(entry))}
                          >
                            <span className="block font-semibold">
                              {showsGrade ? `${entry.gradeLevel.name} · ` : ''}
                              {entry.subject.name}
                            </span>
                            <span className="line-clamp-2">{entry.title}</span>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className="md:hidden">
          {view.entries.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-ink-muted">Nothing planned this month.</p>
          ) : (
            <ul className="divide-y divide-surface-border">
              {[...byDate.entries()].map(([date, entries]) => (
                <li key={date} className="grid gap-2 px-4 py-3">
                  <p className={clsx('text-sm font-semibold', date === today ? 'text-brand-blue' : 'text-ink')}>
                    {dayLabel(date)}
                    {date === today ? ' · Today' : ''}
                  </p>
                  {entries.map((entry) => (
                    <div key={entry.id} className={clsx('rounded-lg border px-3 py-2 text-sm', colourOf(entry))}>
                      <p className="font-semibold">
                        {showsGrade ? `${entry.gradeLevel.name} · ` : ''}
                        {entry.subject.name}
                      </p>
                      <p>{entry.title}</p>
                      {entry.description ? <p className="mt-1 text-xs opacity-80">{entry.description}</p> : null}
                    </div>
                  ))}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      {view.isEnabled && pairs.length > 0 && view.entries.length === 0 ? (
        <p className="hidden text-center text-sm text-ink-muted md:block">Nothing planned this month.</p>
      ) : null}
    </div>
  );
}

function pairKey(pair: CalendarPair): string {
  return `${pair.gradeLevel.id}:${pair.subject.id}`;
}

function pairLabel(pair: CalendarPair): string {
  return `${pair.gradeLevel.name} · ${pair.subject.name}`;
}

function MonthLink({ href, label, children }: { href: string | null; label: string; children: ReactNode }) {
  const className = 'inline-flex h-10 w-10 items-center justify-center rounded-lg';
  return href ? (
    <Link href={href} aria-label={label} className={clsx(className, 'text-ink hover:bg-brand-tint')}>
      {children}
    </Link>
  ) : (
    <span aria-hidden="true" className={clsx(className, 'text-slate-300')}>
      {children}
    </span>
  );
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <div role="status" className="flex items-start gap-3 rounded-card border border-brand-soft bg-brand-tint px-4 py-3 text-sm text-brand-navy">
      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p>{children}</p>
    </div>
  );
}
