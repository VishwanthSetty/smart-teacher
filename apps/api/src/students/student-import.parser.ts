import { BadRequestException } from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import {
  IMPORT_TEMPLATE_HEADERS,
  MAX_IMPORT_ROWS,
  MAX_NAME_PART_LENGTH,
  MAX_ROLL_NUMBER_LENGTH,
  REQUIRED_HEADERS,
} from './student-import.constants';

export type StudentImportErrorCode =
  | 'MISSING_EMAIL'
  | 'INVALID_EMAIL'
  | 'MISSING_FIRST_NAME'
  | 'FIRST_NAME_TOO_LONG'
  | 'MISSING_LAST_NAME'
  | 'LAST_NAME_TOO_LONG'
  | 'MISSING_GRADE_LEVEL'
  | 'MISSING_SECTION'
  | 'ROLL_NUMBER_TOO_LONG'
  | 'DUPLICATE_IN_FILE'
  | 'DUPLICATE_ROLL_IN_FILE'
  | 'DUPLICATE_EXISTING'
  | 'UNKNOWN_GRADE_LEVEL'
  | 'UNKNOWN_SECTION'
  | 'ROLL_NUMBER_TAKEN';

export type StudentImportWarningCode = 'EXTRA_COLUMNS';

export interface StudentImportRowIssue {
  code: StudentImportErrorCode;
  message: string;
}

export interface StudentImportRowError {
  // 1-based line number as a spreadsheet shows it (the header is line 1), taken from
  // csv-parse's `info.lines` so skipped blank lines and quoted embedded newlines
  // can't shift it out of step with what the admin sees on screen.
  rowNumber: number;
  firstName: string;
  lastName: string;
  email: string;
  gradeLevel: string;
  section: string;
  rollNumber: string;
  errors: StudentImportRowIssue[];
}

export interface ParsedStudentRow {
  rowNumber: number;
  firstName: string;
  lastName: string;
  email: string;
  gradeLevel: string;
  section: string;
  rollNumber: string | null;
}

export interface StudentImportWarning {
  code: StudentImportWarningCode;
  message: string;
}

export interface ParsedStudentFile {
  totalRows: number;
  rows: ParsedStudentRow[];
  rowErrors: StudentImportRowError[];
  warnings: StudentImportWarning[];
}

interface CsvRecord {
  record: Record<string, string | undefined>;
  info: { lines: number };
}

// Deliberately the same shape class-validator's @IsEmail accepts for the single-user
// create path, so a row that imports here would also have passed POST /students.
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

// Keyed on (grade level, section, roll number), all lowercased, so "Grade 5"/"grade 5"
// and "A"/"a" collide the way an admin expects. Blank roll numbers never collide — a
// class need not track roll numbers, and the DB's partial unique index excludes NULLs.
function rollKey(gradeLevel: string, section: string, rollNumber: string): string {
  return `${gradeLevel.toLowerCase()}|${section.toLowerCase()}|${rollNumber.toLowerCase()}`;
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

export function parseStudentCsv(buffer: Buffer): ParsedStudentFile {
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

  const warnings: StudentImportWarning[] = [];
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

  const rows: ParsedStudentRow[] = [];
  const rowErrors: StudentImportRowError[] = [];
  // email -> the row number that first claimed it, so a duplicate can name its original.
  const emailFirstSeenAt = new Map<string, number>();
  // (gradeLevel, section, rollNumber) -> the row number that first claimed it.
  const rollFirstSeenAt = new Map<string, number>();

  for (const { record, info } of dataRecords) {
    const rowNumber = info.lines;
    const rawEmail = cell(record, 'email');
    const email = rawEmail.toLowerCase();
    const firstName = cell(record, 'first_name');
    const lastName = cell(record, 'last_name');
    const gradeLevel = cell(record, 'grade_level');
    const section = cell(record, 'section');
    const rollNumber = cell(record, 'roll_number');

    // Every applicable reason is collected, not just the first, so one correction pass
    // fixes the row rather than surfacing its problems one upload at a time.
    const errors: StudentImportRowIssue[] = [];

    if (email === '') {
      errors.push({ code: 'MISSING_EMAIL', message: 'Email is required.' });
    } else if (!EMAIL_PATTERN.test(email)) {
      errors.push({ code: 'INVALID_EMAIL', message: `"${rawEmail}" is not a valid email address.` });
    }

    if (firstName === '') {
      errors.push({ code: 'MISSING_FIRST_NAME', message: 'First name is required.' });
    } else if (firstName.length > MAX_NAME_PART_LENGTH) {
      errors.push({
        code: 'FIRST_NAME_TOO_LONG',
        message: `First name is ${firstName.length} characters; the limit is ${MAX_NAME_PART_LENGTH}.`,
      });
    }

    if (lastName === '') {
      errors.push({ code: 'MISSING_LAST_NAME', message: 'Last name is required.' });
    } else if (lastName.length > MAX_NAME_PART_LENGTH) {
      errors.push({
        code: 'LAST_NAME_TOO_LONG',
        message: `Last name is ${lastName.length} characters; the limit is ${MAX_NAME_PART_LENGTH}.`,
      });
    }

    if (gradeLevel === '') {
      errors.push({ code: 'MISSING_GRADE_LEVEL', message: 'Grade level is required.' });
    }

    if (section === '') {
      errors.push({ code: 'MISSING_SECTION', message: 'Section is required.' });
    }

    if (rollNumber.length > MAX_ROLL_NUMBER_LENGTH) {
      errors.push({
        code: 'ROLL_NUMBER_TOO_LONG',
        message: `Roll number is ${rollNumber.length} characters; the limit is ${MAX_ROLL_NUMBER_LENGTH}.`,
      });
    }

    if (email !== '') {
      const originalRow = emailFirstSeenAt.get(email);
      if (originalRow !== undefined) {
        errors.push({
          code: 'DUPLICATE_IN_FILE',
          message: `Duplicate of row ${originalRow} in this file.`,
        });
      } else {
        // Claimed even when the row is otherwise invalid, so a later good row with the
        // same email is still reported as the duplicate it is.
        emailFirstSeenAt.set(email, rowNumber);
      }
    }

    if (gradeLevel !== '' && section !== '' && rollNumber !== '') {
      const key = rollKey(gradeLevel, section, rollNumber);
      const originalRow = rollFirstSeenAt.get(key);
      if (originalRow !== undefined) {
        errors.push({
          code: 'DUPLICATE_ROLL_IN_FILE',
          message: `Roll number ${rollNumber} is already used by row ${originalRow} in this file.`,
        });
      } else {
        rollFirstSeenAt.set(key, rowNumber);
      }
    }

    if (errors.length > 0) {
      rowErrors.push({
        rowNumber,
        firstName,
        lastName,
        email: rawEmail,
        gradeLevel,
        section,
        rollNumber,
        errors,
      });
      continue;
    }

    rows.push({
      rowNumber,
      firstName,
      lastName,
      email,
      gradeLevel,
      section,
      rollNumber: rollNumber === '' ? null : rollNumber,
    });
  }

  return { totalRows: dataRecords.length, rows, rowErrors, warnings };
}
