import { StudentImportBatchStatus } from '@prisma/client';
import type {
  ParsedStudentRow,
  StudentImportRowError,
  StudentImportWarning,
} from '../student-import.parser';

export type StudentImportPreviewRow = Omit<ParsedStudentRow, 'password'> & { hasPassword: boolean };

// Explicit response shapes rather than the Prisma row: `validRows`/`invalidRows` are
// untyped Json columns, and the batch also carries a schoolId the client must never see.
export interface StudentImportPreviewEntity {
  batchId: string;
  fileName: string;
  status: StudentImportBatchStatus;
  totalRows: number;
  validCount: number;
  invalidCount: number;
  validRows: StudentImportPreviewRow[];
  invalidRows: StudentImportRowError[];
  warnings: StudentImportWarning[];
  createdAt: Date;
}

export interface StudentImportResultEntity {
  batchId: string;
  createdCount: number;
  skippedCount: number;
  emailsSent: number;
  emailsFailed: number;
  invalidRows: StudentImportRowError[];
}
