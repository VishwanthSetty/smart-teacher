import type { AcademicYear } from '@smart-teacher/shared-types';

// Calendar dates travel as 'YYYY-MM-DD' and months as 'YYYY-MM'. All arithmetic is UTC so
// a date never shifts by a day with the server's or the viewer's time zone.

export function todayIso(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function toDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// The requested year if it exists, otherwise the one covering today, otherwise the
// newest. `years` arrives newest first from the API.
export function pickYear(years: AcademicYear[], requestedId?: string): AcademicYear | null {
  const requested = years.find((year) => year.id === requestedId);
  if (requested) {
    return requested;
  }
  const today = todayIso();
  return years.find((year) => year.startDate <= today && today <= year.endDate) ?? years[0] ?? null;
}

export function isMonth(value: string | undefined): value is string {
  return value !== undefined && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

// Today's month when it falls inside the year, otherwise the year's first month.
export function pickMonth(year: AcademicYear, requested?: string): string {
  const first = year.startDate.slice(0, 7);
  const last = year.endDate.slice(0, 7);
  if (isMonth(requested) && requested >= first && requested <= last) {
    return requested;
  }
  const current = todayIso().slice(0, 7);
  return current >= first && current <= last ? current : first;
}

export function shiftMonth(month: string, delta: number): string {
  const date = toDate(`${month}-01`);
  date.setUTCMonth(date.getUTCMonth() + delta);
  return toIso(date).slice(0, 7);
}

export function monthBounds(month: string): { from: string; to: string } {
  const start = toDate(`${month}-01`);
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
  return { from: toIso(start), to: toIso(end) };
}

export function monthLabel(month: string): string {
  return toDate(`${month}-01`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export function dayLabel(iso: string): string {
  return toDate(iso).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

export function longDateLabel(iso: string): string {
  return toDate(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

// Monday-first weeks covering the month; days outside it are null so the grid keeps its
// shape without inventing entries for neighbouring months.
export function monthGrid(month: string): (string | null)[][] {
  const { from, to } = monthBounds(month);
  const first = toDate(from);
  const lastDay = toDate(to).getUTCDate();
  const leading = (first.getUTCDay() + 6) % 7;

  const cells: (string | null)[] = Array.from({ length: leading }, () => null);
  for (let day = 1; day <= lastDay; day += 1) {
    cells.push(`${month}-${String(day).padStart(2, '0')}`);
  }
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  const weeks: (string | null)[][] = [];
  for (let index = 0; index < cells.length; index += 7) {
    weeks.push(cells.slice(index, index + 7));
  }
  return weeks;
}
