'use client';

import { FormEvent, useRef, useState } from 'react';
import type { TeacherImportPreview } from '@smart-teacher/shared-types';

interface ImportUploadFormProps {
  onUploaded: (preview: TeacherImportPreview) => void;
}

export function ImportUploadForm({ onUploaded }: ImportUploadFormProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const file = inputRef.current?.files?.[0];
    if (!file) {
      setError('Choose a CSV file to upload.');
      return;
    }

    const form = new FormData();
    form.append('file', file);

    setIsSubmitting(true);
    const response = await fetch('/api/teachers/bulk', { method: 'POST', body: form });
    setIsSubmitting(false);

    if (!response.ok) {
      // The API's message is the useful one here — it names the missing column, the row
      // count over the limit, or the size limit — so it is shown verbatim.
      const body = await response.json().catch(() => ({ message: 'Failed to upload the file' }));
      setError(body.message ?? 'Failed to upload the file');
      return;
    }

    onUploaded(await response.json());
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <a
          href="/api/teachers/bulk/template"
          download
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-gray-100"
        >
          Download CSV template
        </a>
        <span className="text-xs text-gray-500">
          Columns: email, name, subject_codes (comma-separated, optional). Max 5 MB / 2,000 rows.
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          name="file"
          accept=".csv,text/csv"
          required
          className="w-full max-w-md rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
        >
          {isSubmitting ? 'Checking…' : 'Upload and preview'}
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
