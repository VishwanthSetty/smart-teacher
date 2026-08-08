import { TeacherImportBatchStatus } from '@prisma/client';
import type {
  ParsedTeacherRow,
  TeacherImportRowError,
  TeacherImportWarning,
} from '../teacher-import.parser';

export type TeacherImportPreviewRow = Omit<ParsedTeacherRow, 'password'> & { hasPassword: boolean };

// Explicit response shapes rather than the Prisma row: `validRows`/`invalidRows` are
// untyped Json columns, and the batch also carries a schoolId the client must never see.
export interface TeacherImportPreviewEntity {
  batchId: string;
  fileName: string;
  status: TeacherImportBatchStatus;
  totalRows: number;
  validCount: number;
  invalidCount: number;
  validRows: TeacherImportPreviewRow[];
  invalidRows: TeacherImportRowError[];
  warnings: TeacherImportWarning[];
  createdAt: Date;
}

export interface TeacherImportResultEntity {
  batchId: string;
  createdCount: number;
  skippedCount: number;
  emailsSent: number;
  emailsFailed: number;
  invalidRows: TeacherImportRowError[];
}
