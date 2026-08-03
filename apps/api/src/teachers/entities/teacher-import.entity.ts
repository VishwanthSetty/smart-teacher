import { TeacherImportBatchStatus } from '@prisma/client';
import type {
  ParsedTeacherRow,
  TeacherImportRowError,
  TeacherImportWarning,
} from '../teacher-import.parser';

// Explicit response shapes rather than the Prisma row: `validRows`/`invalidRows` are
// untyped Json columns, and the batch also carries a schoolId the client must never see.
export interface TeacherImportPreviewEntity {
  batchId: string;
  fileName: string;
  status: TeacherImportBatchStatus;
  totalRows: number;
  validCount: number;
  invalidCount: number;
  validRows: ParsedTeacherRow[];
  invalidRows: TeacherImportRowError[];
  warnings: TeacherImportWarning[];
  createdAt: Date;
}

export interface TeacherImportResultEntity {
  batchId: string;
  createdCount: number;
  skippedCount: number;
  invitesSent: number;
  invitesFailed: number;
  invalidRows: TeacherImportRowError[];
}
