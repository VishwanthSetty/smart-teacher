import { stringify } from 'csv-stringify/sync';
import { IMPORT_TEMPLATE_HEADERS, UTF8_BOM } from './teacher-import.constants';
import type { TeacherImportRowError } from './teacher-import.parser';

// The error report repeats the template's own columns before adding `row_number` and
// `errors`, so an admin can delete the two report-only columns, fix the cells in place
// and re-upload the same file rather than reconciling two spreadsheets by hand.
const ERROR_REPORT_HEADERS = ['row_number', ...IMPORT_TEMPLATE_HEADERS, 'errors'] as const;

export function buildTemplateCsv(): string {
  const csv = stringify([['teacher@example.com', 'Asha Rao', 'Grade 5', 'maths,science', '']], {
    header: true,
    columns: [...IMPORT_TEMPLATE_HEADERS],
  });
  return `${UTF8_BOM}${csv}`;
}

export function buildErrorReportCsv(rowErrors: TeacherImportRowError[]): string {
  const csv = stringify(
    rowErrors.map((row) => [
      row.rowNumber,
      row.email,
      row.name,
      row.gradeLevelName,
      row.subjectCodes,
      // Never put credentials in a downloaded report. The admin refills this cell or
      // leaves it blank to generate a new password.
      '',
      row.errors.map((issue) => issue.message).join('; '),
    ]),
    { header: true, columns: [...ERROR_REPORT_HEADERS] },
  );
  return `${UTF8_BOM}${csv}`;
}
