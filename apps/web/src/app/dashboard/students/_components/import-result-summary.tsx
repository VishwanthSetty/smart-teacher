'use client';

import type { StudentImportResult } from '@smart-teacher/shared-types';

interface ImportResultSummaryProps {
  result: StudentImportResult;
  onReset: () => void;
}

export function ImportResultSummary({ result, onReset }: ImportResultSummaryProps) {
  return (
    <div className="space-y-4">
      <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm">
        <p className="font-medium text-green-900">
          Imported {result.createdCount} student{result.createdCount === 1 ? '' : 's'}.
        </p>
        <p className="text-green-800">
          {result.emailsSent} credential email{result.emailsSent === 1 ? '' : 's'} sent · {result.skippedCount}{' '}
          row{result.skippedCount === 1 ? '' : 's'} skipped
        </p>
      </div>

      {result.emailsFailed > 0 && (
        <p className="text-sm text-amber-700">
          {result.emailsFailed} credential email{result.emailsFailed === 1 ? '' : 's'} could not be sent. The students were still created.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {result.skippedCount > 0 && (
          <a
            href={`/api/students/bulk/${result.batchId}/errors`}
            download
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-gray-100"
          >
            Download error report
          </a>
        )}
        <button
          type="button"
          onClick={onReset}
          className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-700"
        >
          Import another file
        </button>
      </div>
    </div>
  );
}
