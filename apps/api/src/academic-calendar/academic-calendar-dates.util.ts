import { UnprocessableEntityException } from '@nestjs/common';

// Calendar dates are Postgres DATE columns exchanged as 'YYYY-MM-DD'. Prisma maps a DATE
// to a Date at UTC midnight, so every conversion here is UTC: a local-time parse would
// shift a date by one day for any server east or west of Greenwich.
export const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function parseDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function todayDateOnly(now: Date = new Date()): Date {
  return parseDateOnly(formatDateOnly(now));
}

export function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / MS_PER_DAY);
}

export interface DateRange {
  startDate: Date;
  endDate: Date;
}

export function isWithinRange(date: Date, range: DateRange): boolean {
  return date.getTime() >= range.startDate.getTime() && date.getTime() <= range.endDate.getTime();
}

export function requireDateWithinYear(date: Date, year: DateRange & { label: string }): void {
  if (!isWithinRange(date, year)) {
    throw new UnprocessableEntityException(
      `The date must fall within academic year ${year.label} (${formatDateOnly(year.startDate)} to ${formatDateOnly(year.endDate)})`,
    );
  }
}
