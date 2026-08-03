import { StudentImportBatchStatus } from '@prisma/client';
import type {
  ParsedStudentRow,
  StudentImportRowError,
  StudentImportWarning,
} from '../student-import.parser';

// Explicit response shapes rather than the Prisma row: `validRows`/`invalidRows` are
// untyped Json columns, and the batch also carries a schoolId the client must never see.
export interface StudentImportPreviewEntity {
  batchId: string;
  fileName: string;
  status: StudentImportBatchStatus;
  totalRows: number;
  validCount: number;
  invalidCount: number;
  validRows: ParsedStudentRow[];
  invalidRows: StudentImportRowError[];
  warnings: StudentImportWarning[];
  createdAt: Date;
}

export interface StudentImportResultEntity {
  batchId: string;
  createdCount: number;
  skippedCount: number;
  invitesSent: number;
  invitesFailed: number;
  invalidRows: StudentImportRowError[];
}
