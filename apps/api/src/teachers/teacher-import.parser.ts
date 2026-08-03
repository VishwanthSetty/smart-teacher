import { BadRequestException } from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import {
  IMPORT_TEMPLATE_HEADERS,
  MAX_IMPORT_ROWS,
  MAX_NAME_LENGTH,
  REQUIRED_HEADERS,
} from './teacher-import.constants';

export type TeacherImportErrorCode =
  | 'MISSING_EMAIL'
  | 'INVALID_EMAIL'
  | 'MISSING_NAME'
  | 'NAME_TOO_LONG'
  | 'DUPLICATE_IN_FILE'
  | 'DUPLICATE_EXISTING'
  | 'UNKNOWN_SUBJECT'
  | 'RETIRED_SUBJECT';

export type TeacherImportWarningCode = 'EXTRA_COLUMNS';

export interface TeacherImportRowIssue {
  code: TeacherImportErrorCode;
  message: string;
}

export interface TeacherImportRowError {
  // 1-based line number as a spreadsheet shows it (the header is line 1), taken from
  // csv-parse's `info.lines` so skipped blank lines and quoted embedded newlines
  // can't shift it out of step with what the admin sees on screen.
  rowNumber: number;
  email: string;
  name: string;
  subjectCodes: string;
  errors: TeacherImportRowIssue[];
}

export interface ParsedTeacherRow {
  rowNumber: number;
  email: string;
  name: string;
  subjectCodes: string[];
  rawSubjectCodes: string;
}

export interface TeacherImportWarning {
  code: TeacherImportWarningCode;
  message: string;
}

export interface ParsedTeacherFile {
  totalRows: number;
  rows: ParsedTeacherRow[];
  rowErrors: TeacherImportRowError[];
  warnings: TeacherImportWarning[];
}

interface CsvRecord {
  record: Record<string, string | undefined>;
  info: { lines: number };
}

// Deliberately the same shape class-validator's @IsEmail accepts for the single-user
// create path, so a row that imports here would also have passed POST /admin/users.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

// Header matching is normalised, not exact: Excel round-trips headers with stray case,
// spaces and hyphens, and none of that changes which column the admin meant.
function normalizeHeader(header: string): string {
  return header
    .replace(/^\uFEFF/, '')
    .replace(/^["']|["']$/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

function cell(record: Record<string, string | undefined>, key: string): string {
  return (record[key] ?? '').trim();
}

function isBlankRecord(record: Record<string, string | undefined>): boolean {
  return Object.values(record).every((value) => (value ?? '').trim() === '');
}

function splitSubjectCodes(raw: string): string[] {
  const seen = new Set<string>();
  for (const part of raw.split(',')) {
    const code = part.trim().toLowerCase();
    if (code !== '') {
      seen.add(code);
    }
  }
  return [...seen];
}

function readRecords(buffer: Buffer): { records: CsvRecord[]; headers: string[] } {
  const headers: string[] = [];

  let records: CsvRecord[];
  try {
    records = parse(buffer, {
      // Excel's "CSV UTF-8" export prefixes a BOM, which would otherwise become part of
      // the first header name and make `email` unfindable.
      bom: true,
      columns: (header: string[]) => {
        const normalized = header.map(normalizeHeader);
        headers.push(...normalized);
        return normalized;
      },
      skip_empty_lines: true,
      // A row with too few or too many fields becomes an ordinary row error below rather
      // than aborting the whole file — partial success is the required behaviour.
      relax_column_count: true,
      trim: true,
      info: true,
    }) as CsvRecord[];
  } catch {
    throw new BadRequestException(
      'This file could not be read as CSV. Save it as "CSV UTF-8" and try again.',
    );
  }

  return { records, headers };
}

export function parseTeacherCsv(buffer: Buffer): ParsedTeacherFile {
  if (buffer.length === 0) {
    throw new BadRequestException('The uploaded file is empty.');
  }

  const { records, headers } = readRecords(buffer);

  if (headers.length === 0) {
    throw new BadRequestException('The uploaded file is empty.');
  }

  const missingHeaders = REQUIRED_HEADERS.filter((header) => !headers.includes(header));
  if (missingHeaders.length > 0) {
    throw new BadRequestException(
      `Missing required column(s): ${missingHeaders.join(', ')}. Download the template for the expected headers.`,
    );
  }

  const warnings: TeacherImportWarning[] = [];
  const extraHeaders = headers.filter(
    (header) => header !== '' && !IMPORT_TEMPLATE_HEADERS.includes(header as never),
  );
  if (extraHeaders.length > 0) {
    warnings.push({
      code: 'EXTRA_COLUMNS',
      message: `Ignored unrecognised column(s): ${extraHeaders.join(', ')}.`,
    });
  }

  // Trailing blank rows are what Excel leaves behind after a delete; they are not data
  // and must not count against the row limit or show up as errors.
  const dataRecords = records.filter(({ record }) => !isBlankRecord(record));

  if (dataRecords.length === 0) {
    throw new BadRequestException('The uploaded file has no data rows.');
  }

  if (dataRecords.length > MAX_IMPORT_ROWS) {
    throw new BadRequestException(
      `This file has ${dataRecords.length.toLocaleString('en-US')} rows. The limit is ${MAX_IMPORT_ROWS.toLocaleString('en-US')} rows per import — split the file and upload it in parts.`,
    );
  }

  const rows: ParsedTeacherRow[] = [];
  const rowErrors: TeacherImportRowError[] = [];
  // email -> the row number that first claimed it, so a duplicate can name its original.
  const firstSeenAt = new Map<string, number>();

  for (const { record, info } of dataRecords) {
    const rowNumber = info.lines;
    const rawEmail = cell(record, 'email');
    const email = rawEmail.toLowerCase();
    const name = cell(record, 'name');
    const rawSubjectCodes = cell(record, 'subject_codes');

    // Every applicable reason is collected, not just the first, so one correction pass
    // fixes the row rather than surfacing its problems one upload at a time.
    const errors: TeacherImportRowIssue[] = [];

    if (email === '') {
      errors.push({ code: 'MISSING_EMAIL', message: 'Email is required.' });
    } else if (!EMAIL_PATTERN.test(email)) {
      errors.push({ code: 'INVALID_EMAIL', message: `"${rawEmail}" is not a valid email address.` });
    }

    if (name === '') {
      errors.push({ code: 'MISSING_NAME', message: 'Name is required.' });
    } else if (name.length > MAX_NAME_LENGTH) {
      errors.push({
        code: 'NAME_TOO_LONG',
        message: `Name is ${name.length} characters; the limit is ${MAX_NAME_LENGTH}.`,
      });
    }

    if (email !== '') {
      const originalRow = firstSeenAt.get(email);
      if (originalRow !== undefined) {
        errors.push({
          code: 'DUPLICATE_IN_FILE',
          message: `Duplicate of row ${originalRow} in this file.`,
        });
      } else {
        // Claimed even when the row is otherwise invalid, so a later good row with the
        // same email is still reported as the duplicate it is.
        firstSeenAt.set(email, rowNumber);
      }
    }

    if (errors.length > 0) {
      rowErrors.push({ rowNumber, email: rawEmail, name, subjectCodes: rawSubjectCodes, errors });
      continue;
    }

    rows.push({
      rowNumber,
      email,
      name,
      subjectCodes: splitSubjectCodes(rawSubjectCodes),
      rawSubjectCodes,
    });
  }

  return { totalRows: dataRecords.length, rows, rowErrors, warnings };
}
