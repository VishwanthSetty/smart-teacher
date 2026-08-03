import { stringify } from 'csv-stringify/sync';
import { IMPORT_TEMPLATE_HEADERS, UTF8_BOM } from './student-import.constants';
import type { StudentImportRowError } from './student-import.parser';

// The error report repeats the template's own columns before adding `row_number` and
// `errors`, so an admin can delete the two report-only columns, fix the cells in place
// and re-upload the same file rather than reconciling two spreadsheets by hand.
const ERROR_REPORT_HEADERS = ['row_number', ...IMPORT_TEMPLATE_HEADERS, 'errors'] as const;

export function buildTemplateCsv(): string {
  const csv = stringify([['Asha', 'Rao', 'asha@example.com', 'Grade 5', 'A', '12']], {
    header: true,
    columns: [...IMPORT_TEMPLATE_HEADERS],
  });
  return `${UTF8_BOM}${csv}`;
}

export function buildErrorReportCsv(rowErrors: StudentImportRowError[]): string {
  const csv = stringify(
    rowErrors.map((row) => [
      row.rowNumber,
      row.firstName,
      row.lastName,
      row.email,
      row.gradeLevel,
      row.section,
      row.rollNumber,
      row.errors.map((issue) => issue.message).join('; '),
    ]),
    { header: true, columns: [...ERROR_REPORT_HEADERS] },
  );
  return `${UTF8_BOM}${csv}`;
}
