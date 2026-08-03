'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { TeacherImportPreview, TeacherImportResult } from '@smart-teacher/shared-types';
import { ImportUploadForm } from './import-upload-form';
import { ImportPreviewTable } from './import-preview-table';
import { ImportResultSummary } from './import-result-summary';

type Step =
  | { name: 'upload' }
  | { name: 'preview'; preview: TeacherImportPreview }
  | { name: 'done'; result: TeacherImportResult };

export function BulkImportPanel() {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ name: 'upload' });
  const [error, setError] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  async function handleConfirm(batchId: string) {
    setError(null);
    setIsConfirming(true);

    const response = await fetch(`/api/teachers/bulk/${batchId}/confirm`, { method: 'POST' });

    setIsConfirming(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({ message: 'Failed to import the teachers' }));
      setError(body.message ?? 'Failed to import the teachers');
      return;
    }

    setStep({ name: 'done', result: await response.json() });
    // The teachers table above is server-rendered, so the new rows only appear after a
    // refresh — the same mechanism every other mutation in this app uses.
    router.refresh();
  }

  return (
    <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <div>
        <h2 className="text-base font-semibold">Bulk import</h2>
        <p className="text-sm text-gray-600">
          Upload a CSV to invite many teachers at once. You will see what will be imported
          before anything is saved.
        </p>
      </div>

      {step.name === 'upload' && (
        <ImportUploadForm
          onUploaded={(preview) => {
            setError(null);
            setStep({ name: 'preview', preview });
          }}
        />
      )}

      {step.name === 'preview' && (
        <ImportPreviewTable
          preview={step.preview}
          isConfirming={isConfirming}
          onConfirm={() => handleConfirm(step.preview.batchId)}
          onCancel={() => {
            setError(null);
            setStep({ name: 'upload' });
          }}
        />
      )}

      {step.name === 'done' && (
        <ImportResultSummary
          result={step.result}
          onReset={() => {
            setError(null);
            setStep({ name: 'upload' });
          }}
        />
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
