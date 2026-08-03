'use client';

import type { TeacherImportPreview } from '@smart-teacher/shared-types';

interface ImportPreviewTableProps {
  preview: TeacherImportPreview;
  isConfirming: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ImportPreviewTable({
  preview,
  isConfirming,
  onConfirm,
  onCancel,
}: ImportPreviewTableProps) {
  return (
    <div className="space-y-4">
      <div className="rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-sm">
        <p className="font-medium">{preview.fileName}</p>
        <p className="text-gray-600">
          {preview.validCount} row{preview.validCount === 1 ? '' : 's'} ready to import ·{' '}
          {preview.invalidCount} row{preview.invalidCount === 1 ? '' : 's'} with errors ·{' '}
          {preview.totalRows} row{preview.totalRows === 1 ? '' : 's'} read
        </p>
        <p className="mt-1 text-xs text-gray-500">Nothing has been saved yet.</p>
      </div>

      {preview.warnings.map((warning) => (
        <p key={warning.code} className="text-sm text-amber-700">
          {warning.message}
        </p>
      ))}

      {preview.invalidCount > 0 && (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-left text-sm">
            <caption className="px-4 py-2 text-left text-xs uppercase tracking-wide text-gray-500">
              Rows that will be skipped
            </caption>
            <thead className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-2 font-medium">Row</th>
                <th className="px-4 py-2 font-medium">Email</th>
                <th className="px-4 py-2 font-medium">Reasons</th>
              </tr>
            </thead>
            <tbody>
              {preview.invalidRows.map((row) => (
                <tr key={row.rowNumber} className="border-b border-gray-100 last:border-b-0">
                  <td className="px-4 py-2 text-gray-600">{row.rowNumber}</td>
                  <td className="px-4 py-2">{row.email || <span className="text-gray-400">—</span>}</td>
                  <td className="px-4 py-2 text-red-600">
                    {row.errors.map((issue) => issue.message).join(' ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {preview.validCount > 0 && (
        <details className="rounded-lg border border-gray-200">
          <summary className="cursor-pointer px-4 py-2 text-sm font-medium">
            {preview.validCount} teacher{preview.validCount === 1 ? '' : 's'} will be invited
          </summary>
          <div className="overflow-x-auto border-t border-gray-200">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Row</th>
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">Email</th>
                  <th className="px-4 py-2 font-medium">Subjects</th>
                </tr>
              </thead>
              <tbody>
                {preview.validRows.map((row) => (
                  <tr key={row.rowNumber} className="border-b border-gray-100 last:border-b-0">
                    <td className="px-4 py-2 text-gray-600">{row.rowNumber}</td>
                    <td className="px-4 py-2">{row.name}</td>
                    <td className="px-4 py-2 text-gray-600">{row.email}</td>
                    <td className="px-4 py-2 text-gray-600">
                      {row.subjectCodes.join(', ') || <span className="text-gray-400">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onConfirm}
          disabled={isConfirming || preview.validCount === 0}
          className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
        >
          {isConfirming
            ? 'Importing…'
            : `Import ${preview.validCount} teacher${preview.validCount === 1 ? '' : 's'}`}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={isConfirming}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-gray-100 disabled:opacity-50"
        >
          Cancel
        </button>
        {preview.validCount === 0 && (
          <span className="text-xs text-gray-500">
            No rows passed validation — fix the file and upload it again.
          </span>
        )}
      </div>
    </div>
  );
}
