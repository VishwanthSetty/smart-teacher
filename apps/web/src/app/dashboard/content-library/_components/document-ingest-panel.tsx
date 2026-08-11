'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { Curriculum, DocumentUploadTicket } from '@smart-teacher/shared-types';
import { DocumentMetadataForm, type DocumentMetadataSubmission } from './document-metadata-form';
import { UploadProgressBar } from './upload-progress-bar';
import { uploadWithProgress } from './upload-with-progress';

export function DocumentIngestPanel({ curricula }: { curricula: Curriculum[] }) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function handleSubmit(submission: DocumentMetadataSubmission) {
    setError(null); setProgress(0);
    const created = await fetch('/api/documents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: submission.title, description: submission.description, contentNodeId: submission.contentNodeId, contentType: submission.file.type, sizeBytes: submission.file.size }) });
    if (!created.ok) { const body = await created.json().catch(() => ({})); setError(body.message ?? 'Failed to create document'); setProgress(null); return; }
    const ticket: DocumentUploadTicket = await created.json();
    try {
      await uploadWithProgress({ url: ticket.uploadUrl, file: submission.file, contentType: submission.file.type, onProgress: ({ percent }) => setProgress(percent) });
      const confirmed = await fetch(`/api/documents/${ticket.document.id}/uploaded`, { method: 'POST' });
      if (!confirmed.ok) { const body = await confirmed.json().catch(() => ({})); throw new Error(body.message ?? 'Failed to confirm upload'); }
      setProgress(null); setIsOpen(false); router.refresh();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Upload failed'); setProgress(null); router.refresh();
    }
  }
  return <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
    <button type="button" onClick={() => setIsOpen((value) => !value)} className="flex w-full items-center justify-between p-6 text-left">
      <div><h2 className="font-semibold">Add a PDF</h2><p className="text-sm text-gray-600">Upload lesson plans or teacher material directly to storage.</p></div>
      {isOpen ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
    </button>
    {isOpen && <div className="space-y-4 border-t p-6">{progress === null ? <DocumentMetadataForm curricula={curricula} onSubmit={handleSubmit} /> : <UploadProgressBar percent={progress} label="Uploading PDF" />}{error && <p className="text-sm text-red-600">{error}</p>}</div>}
  </div>;
}
