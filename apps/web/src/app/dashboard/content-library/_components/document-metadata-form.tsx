'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ACCEPTED_DOCUMENT_CONTENT_TYPES,
  MAX_DOCUMENT_BYTES,
  type AdminDocumentDetail,
  type Curriculum,
} from '@smart-teacher/shared-types';
import { ContentNodePicker } from '@/components/content/content-node-picker';

export interface DocumentMetadataSubmission {
  title: string;
  description?: string;
  contentNodeId: string;
  file: File;
}

type Props =
  | { document: AdminDocumentDetail; curricula: Curriculum[] }
  | {
      document?: never;
      curricula: Curriculum[];
      onSubmit: (submission: DocumentMetadataSubmission) => Promise<void>;
    };

export function DocumentMetadataForm(props: Props) {
  const { curricula } = props;
  const document = props.document;
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    const data = new FormData(event.currentTarget);
    const contentNodeId = String(data.get('contentNodeId') ?? '');
    if (!contentNodeId) {
      setError('Choose where this document belongs.');
      setBusy(false);
      return;
    }

    if (document) {
      const response = await fetch(`/api/documents/${document.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: String(data.get('title') ?? ''),
          description: String(data.get('description') ?? ''),
          contentNodeId,
        }),
      });
      setBusy(false);
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.message ?? 'Failed to update document');
        return;
      }
      router.refresh();
      return;
    }

    const file = data.get('file');
    if (!(file instanceof File) || file.size === 0) {
      setError('Choose a PDF document.');
      setBusy(false);
      return;
    }
    if (!(ACCEPTED_DOCUMENT_CONTENT_TYPES as readonly string[]).includes(file.type)) {
      setError('Only PDF documents can be uploaded.');
      setBusy(false);
      return;
    }
    if (file.size > MAX_DOCUMENT_BYTES) {
      setError('That file is larger than the 50 MB limit.');
      setBusy(false);
      return;
    }
    await props.onSubmit({
      title: String(data.get('title')),
      description: String(data.get('description') || '') || undefined,
      contentNodeId,
      file,
    });
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="grid gap-4 rounded-lg border bg-white p-5">
      <label className="grid gap-1 text-sm">
        Title
        <input required name="title" defaultValue={document?.title} className="rounded border px-3 py-2" />
      </label>
      <label className="grid gap-1 text-sm">
        Description
        <textarea name="description" defaultValue={document?.description ?? ''} className="rounded border px-3 py-2" />
      </label>
      <ContentNodePicker
        curricula={curricula}
        defaultCurriculumId={document?.curriculumId}
        defaultNodeId={document?.contentNodeId}
      />
      {!document && (
        <label className="grid gap-1 text-sm">
          PDF file
          <input required name="file" type="file" accept="application/pdf,.pdf" />
        </label>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        disabled={busy}
        className="w-fit rounded bg-gray-900 px-4 py-2 text-white disabled:opacity-50"
      >
        {busy ? 'Saving…' : document ? 'Save metadata' : 'Create and upload'}
      </button>
    </form>
  );
}
