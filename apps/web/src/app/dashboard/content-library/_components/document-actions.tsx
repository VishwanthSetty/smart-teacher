'use client';

import { ChangeEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ACCEPTED_DOCUMENT_CONTENT_TYPES,
  DocumentStatus,
  MAX_DOCUMENT_BYTES,
  type AdminDocumentDetail,
  type DocumentUploadTicket,
} from '@smart-teacher/shared-types';
import { UploadProgressBar } from './upload-progress-bar';
import { uploadWithProgress } from './upload-with-progress';

export function DocumentActions({ document }: { document: AdminDocumentDetail }) {
  const router = useRouter();
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  async function replace(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError(null);
    if (!(ACCEPTED_DOCUMENT_CONTENT_TYPES as readonly string[]).includes(file.type)) {
      setError('Only PDF documents can be uploaded.');
      return;
    }
    if (file.size === 0 || file.size > MAX_DOCUMENT_BYTES) {
      setError('Choose a PDF between 1 byte and 50 MB.');
      return;
    }

    setProgress(0);
    try {
      const response = await fetch(`/api/documents/${document.id}/upload-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentType: file.type, sizeBytes: file.size }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message ?? 'Failed to create an upload URL');
      }
      const ticket = (await response.json()) as DocumentUploadTicket;
      await uploadWithProgress({
        url: ticket.uploadUrl,
        file,
        contentType: file.type,
        onProgress: ({ percent }) => setProgress(percent),
      });
      const confirmed = await fetch(`/api/documents/${document.id}/uploaded`, { method: 'POST' });
      if (!confirmed.ok) {
        const body = await confirmed.json().catch(() => ({}));
        throw new Error(body.message ?? 'Failed to confirm the upload');
      }
      setProgress(null);
      router.refresh();
    } catch (uploadError) {
      setProgress(null);
      setError(uploadError instanceof Error ? uploadError.message : 'Upload failed');
      router.refresh();
    }
  }

  async function remove() {
    if (!window.confirm(`Delete “${document.title}” and its PDF source?`)) return;
    setIsDeleting(true);
    setError(null);
    const response = await fetch(`/api/documents/${document.id}`, { method: 'DELETE' });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.message ?? 'Failed to delete document');
      setIsDeleting(false);
      return;
    }
    router.push('/dashboard/content-library?kind=documents');
    router.refresh();
  }

  return (
    <section className="space-y-4 rounded-lg border bg-white p-5">
      <h2 className="font-semibold">File actions</h2>
      {progress !== null && <UploadProgressBar percent={progress} label="Uploading PDF" />}
      {document.status !== DocumentStatus.READY && progress === null && (
        <label className="inline-flex cursor-pointer rounded border px-3 py-2 text-sm font-medium hover:bg-gray-50">
          Replace PDF
          <input type="file" accept="application/pdf,.pdf" className="sr-only" onChange={replace} />
        </label>
      )}
      {document.status === DocumentStatus.READY && (
        <p className="text-sm text-gray-600">A ready PDF cannot be replaced; delete it and create a new record instead.</p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="button"
        disabled={isDeleting}
        onClick={() => void remove()}
        className="rounded border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
      >
        {isDeleting ? 'Deleting…' : 'Delete document'}
      </button>
    </section>
  );
}
