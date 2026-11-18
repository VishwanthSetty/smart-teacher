import { BadRequestException, UnprocessableEntityException } from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import { Workbook, type CellValue } from 'exceljs';
import { formatDateOnly, isWithinRange, parseDateOnly, type DateRange } from './academic-calendar-dates.util';
import type { CalendarImportResultEntity } from './entities/calendar-import-result.entity';

// Product rules, not deployment config: one answer to "what does the template look like"
// across the parser, the template download and the web form.
export const MAX_CALENDAR_IMPORT_BYTES = 5 * 1024 * 1024;
// A year is ~365 days and a day may hold a few periods.
export const MAX_CALENDAR_IMPORT_ROWS = 2000;
export const CALENDAR_IMPORT_TEMPLATE_NAME = 'academic-calendar-template.xlsx';
export const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 2000;

// Matched after lower-casing and trimming, so "Lesson", "LESSON " and "title" all work.
const HEADER_ALIASES = {
  date: ['date', 'day'],
  title: ['lesson', 'title', 'topic'],
  description: ['notes', 'note', 'description', 'details'],
} as const;

type Column = keyof typeof HEADER_ALIASES;

export interface CalendarImportRow {
  // 1-based, as the spreadsheet shows it (the header is row 1).
  rowNumber: number;
  date: string;
  title: string;
  description: string | null;
}

export interface CalendarImportRowError {
  rowNumber: number;
  date: string;
  title: string;
  errors: string[];
}

export interface ParsedCalendarImport {
  rows: CalendarImportRow[];
  errors: CalendarImportRowError[];
}

interface RawRow {
  rowNumber: number;
  date: unknown;
  title: unknown;
  description: unknown;
}

export async function parseCalendarImport(
  file: { buffer: Buffer; originalname: string },
  year: DateRange & { label: string },
): Promise<ParsedCalendarImport> {
  const name = file.originalname.toLowerCase();
  const raw = name.endsWith('.csv')
    ? readCsv(file.buffer)
    : name.endsWith('.xlsx')
      ? await readXlsx(file.buffer)
      : badFile('Upload an Excel (.xlsx) or CSV file');

  if (raw.length === 0) {
    badFile('The file has no lesson rows');
  }
  if (raw.length > MAX_CALENDAR_IMPORT_ROWS) {
    badFile(`The file has ${raw.length} rows; the limit is ${MAX_CALENDAR_IMPORT_ROWS}`);
  }

  const rows: CalendarImportRow[] = [];
  const errors: CalendarImportRowError[] = [];
  const seen = new Set<string>();

  for (const row of raw) {
    const date = toIsoDate(row.date);
    const title = toText(row.title);
    const description = toText(row.description);
    const problems: string[] = [];

    if (date === null) {
      problems.push(
        toText(row.date) === '' ? 'Date is missing' : 'Date must be a date, YYYY-MM-DD or DD/MM/YYYY',
      );
    } else if (!isWithinRange(parseDateOnly(date), year)) {
      problems.push(`Date is outside academic year ${year.label}`);
    }
    if (title === '') {
      problems.push('Lesson is missing');
    } else if (title.length > MAX_TITLE_LENGTH) {
      problems.push(`Lesson is longer than ${MAX_TITLE_LENGTH} characters`);
    }
    if (description.length > MAX_DESCRIPTION_LENGTH) {
      problems.push(`Notes are longer than ${MAX_DESCRIPTION_LENGTH} characters`);
    }

    // The same lesson twice on one day is a copy-paste slip, not two periods.
    const key = `${date}|${title.toLowerCase()}`;
    if (problems.length === 0 && seen.has(key)) {
      problems.push('Same date and lesson appear earlier in the file');
    }

    if (problems.length > 0 || date === null) {
      errors.push({ rowNumber: row.rowNumber, date: date ?? toText(row.date), title, errors: problems });
      continue;
    }
    seen.add(key);
    rows.push({ rowNumber: row.rowNumber, date, title, description: description === '' ? null : description });
  }

  return { rows, errors };
}

export interface CalendarImportPlan {
  toCreate: CalendarImportRow[];
  duplicateCount: number;
}

// Decides what a commit would write, given what the calendar already holds. Shared by
// the platform and school services so both kinds of calendar import identically.
//
// Appending skips rows already in the calendar (same date and lesson): re-uploading a
// sheet after adding a few rows must not double every earlier lesson. Replacing starts
// from empty, so nothing is a duplicate.
export function planCalendarImport(
  parsed: ParsedCalendarImport,
  existing: { date: Date; title: string }[],
  replaceExisting: boolean,
): CalendarImportPlan {
  if (replaceExisting) {
    return { toCreate: parsed.rows, duplicateCount: 0 };
  }
  const present = new Set(existing.map((entry) => `${formatDateOnly(entry.date)}|${entry.title.trim().toLowerCase()}`));
  const toCreate = parsed.rows.filter((row) => !present.has(`${row.date}|${row.title.toLowerCase()}`));
  return { toCreate, duplicateCount: parsed.rows.length - toCreate.length };
}

// All or nothing: a commit with any invalid row writes nothing. A calendar half-imported
// from a sheet is harder to repair than a sheet fixed and uploaded again, and the dry
// run has already shown exactly which rows need fixing.
export function requireImportable(parsed: ParsedCalendarImport): void {
  if (parsed.errors.length > 0) {
    throw new UnprocessableEntityException(
      `${parsed.errors.length} row(s) have problems; fix them and upload the file again`,
    );
  }
}

export interface UploadedCalendarFile {
  buffer: Buffer;
  originalname: string;
}

export function requireFile(file: UploadedCalendarFile | undefined): UploadedCalendarFile {
  if (file === undefined) {
    throw new BadRequestException('Attach an Excel (.xlsx) or CSV file in the "file" field');
  }
  return file;
}

export function importResult(
  parsed: ParsedCalendarImport,
  plan: CalendarImportPlan,
  options: { isCommitted: boolean; replaceExisting: boolean; existingCount: number },
): CalendarImportResultEntity {
  return {
    isCommitted: options.isCommitted,
    replaceExisting: options.replaceExisting,
    totalRows: parsed.rows.length + parsed.errors.length,
    rows: plan.toCreate,
    errors: parsed.errors,
    duplicateCount: plan.duplicateCount,
    // For a dry run these are what a commit would do.
    deletedCount: options.replaceExisting ? options.existingCount : 0,
    createdCount: options.isCommitted ? plan.toCreate.length : 0,
  };
}

export async function buildCalendarImportTemplate(year?: DateRange & { label: string }): Promise<Buffer> {
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet('Lessons');
  sheet.columns = [
    { header: 'Date', key: 'date', width: 14, style: { numFmt: 'yyyy-mm-dd' } },
    { header: 'Lesson', key: 'lesson', width: 48 },
    { header: 'Notes', key: 'notes', width: 60 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  const example = year ? year.startDate : parseDateOnly('2026-06-01');
  sheet.addRow({ date: example, lesson: 'Chapter 1 — Numbers up to 10,000', notes: 'Optional' });

  const help = workbook.addWorksheet('How to fill');
  help.columns = [{ width: 100 }];
  [
    'One row per lesson. Several rows may share a date (e.g. two periods).',
    'Date: an Excel date, or text as YYYY-MM-DD or DD/MM/YYYY. It must fall inside the academic year.',
    'Lesson: required, up to 200 characters.',
    'Notes: optional, up to 2000 characters.',
    'Only the first sheet is read. Delete the example row before uploading.',
  ].forEach((line) => help.addRow([line]));

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function readXlsx(buffer: Buffer): Promise<RawRow[]> {
  const workbook = new Workbook();
  try {
    // exceljs types its input as an ArrayBuffer; a copied view also detaches the parse
    // from multer's pooled buffer.
    await workbook.xlsx.load(new Uint8Array(buffer).buffer);
  } catch {
    badFile('The file could not be read as an Excel workbook');
  }
  const sheet = workbook.worksheets[0];
  if (sheet === undefined) {
    badFile('The workbook has no sheets');
  }

  const header: string[] = [];
  sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, column) => {
    header[column - 1] = toText(cell.value);
  });
  const columns = locateColumns(header);

  const rows: RawRow[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) {
      return;
    }
    const cell = (column: number | undefined): unknown =>
      column === undefined ? null : unwrapCell(row.getCell(column + 1).value);
    const raw = { rowNumber, date: cell(columns.date), title: cell(columns.title), description: cell(columns.description) };
    if (!isBlankRow(raw)) {
      rows.push(raw);
    }
  });
  return rows;
}

function readCsv(buffer: Buffer): RawRow[] {
  let records: string[][];
  try {
    records = parse(buffer, { bom: true, skip_empty_lines: false, relax_column_count: true });
  } catch {
    badFile('The file could not be read as CSV');
  }
  const [header = [], ...body] = records;
  const columns = locateColumns(header);
  return body
    .map((record, index) => ({
      rowNumber: index + 2,
      date: columns.date === undefined ? null : record[columns.date],
      title: columns.title === undefined ? null : record[columns.title],
      description: columns.description === undefined ? null : record[columns.description],
    }))
    .filter((row) => !isBlankRow(row));
}

function locateColumns(header: string[]): Partial<Record<Column, number>> {
  const normalised = header.map((value) => value.trim().toLowerCase());
  const columns: Partial<Record<Column, number>> = {};
  for (const column of Object.keys(HEADER_ALIASES) as Column[]) {
    const index = normalised.findIndex((value) => (HEADER_ALIASES[column] as readonly string[]).includes(value));
    if (index >= 0) {
      columns[column] = index;
    }
  }
  if (columns.date === undefined || columns.title === undefined) {
    badFile('The first row must have "Date" and "Lesson" column headings — download the template to start');
  }
  return columns;
}

// exceljs hands back rich text, formulas and hyperlinks as objects; reduce each to the
// value a person sees in the cell.
function unwrapCell(value: CellValue): unknown {
  if (value === null || typeof value !== 'object' || value instanceof Date) {
    return value;
  }
  if ('result' in value) {
    return value.result ?? null;
  }
  if ('richText' in value) {
    return value.richText.map((part) => part.text).join('');
  }
  if ('text' in value) {
    return value.text;
  }
  return null;
}

function toText(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (value instanceof Date) {
    return formatDateOnly(value);
  }
  return String(unwrapCell(value as CellValue) ?? '').trim();
}

// Excel stores dates as day serials with no time zone; exceljs turns a date-formatted
// cell into a Date at UTC midnight, so the UTC calendar day is the one the sheet shows.
function toIsoDate(value: unknown): string | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : formatDateOnly(value);
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    // An unformatted date cell: days since 1899-12-30 (Excel's epoch, leap-bug included).
    return formatDateOnly(new Date(Math.round((value - 25569) * 86_400_000)));
  }
  const text = toText(value);
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  // Day first: the convention in the schools this platform serves.
  const dayFirst = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text);
  const parts = iso ? [iso[1], iso[2], iso[3]] : dayFirst ? [dayFirst[3], dayFirst[2], dayFirst[1]] : null;
  if (parts === null) {
    return null;
  }
  const candidate = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
  const date = parseDateOnly(candidate);
  // Rejects 31/02/2027 rather than letting it roll over into March.
  return !Number.isNaN(date.getTime()) && formatDateOnly(date) === candidate ? candidate : null;
}

function isBlankRow(row: RawRow): boolean {
  return toText(row.date) === '' && toText(row.title) === '' && toText(row.description) === '';
}

function badFile(message: string): never {
  throw new BadRequestException(message);
}
