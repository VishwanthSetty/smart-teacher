'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type {
  AdminVideo,
  Curriculum,
  VideoUploadTicket,
} from '@smart-teacher/shared-types';
import { VideoMetadataForm, type VideoMetadataSubmission } from './video-metadata-form';
import { UploadProgressBar } from './upload-progress-bar';
import { uploadWithProgress } from './upload-with-progress';

type Step =
  | { name: 'form' }
  | { name: 'uploading'; title: string; percent: number }
  | { name: 'done'; video: AdminVideo };

interface VideoIngestPanelProps {
  curricula: Curriculum[];
}

export function VideoIngestPanel({ curricula }: VideoIngestPanelProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ name: 'form' });
  const [error, setError] = useState<string | null>(null);
  // Collapsed by default — the catalogue browser below is the primary view; this is an
  // occasional action, not something that should push it off screen on every visit.
  const [isOpen, setIsOpen] = useState(false);

  async function handleSubmit(submission: VideoMetadataSubmission) {
    setError(null);
    setStep({ name: 'uploading', title: submission.title, percent: 0 });

    const created = await fetch('/api/videos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: submission.title,
        description: submission.description,
        contentNodeId: submission.contentNodeId,
        contentType: submission.file.type,
        sizeBytes: submission.file.size,
      }),
    });

    if (!created.ok) {
      const body = await created.json().catch(() => ({ message: 'Failed to create the video' }));
      setError(body.message ?? 'Failed to create the video');
      setStep({ name: 'form' });
      return;
    }

    const ticket: VideoUploadTicket = await created.json();

    try {
      await uploadWithProgress({
        url: ticket.uploadUrl,
        file: submission.file,
        contentType: submission.file.type,
        onProgress: ({ percent }) =>
          setStep({ name: 'uploading', title: submission.title, percent }),
      });
    } catch (uploadError) {
      // The record survives in UPLOADING on purpose — it shows up in the table below
      // with Retry and Delete, rather than vanishing and stranding the object.
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : 'Upload failed. The video is saved and can be retried below.',
      );
      setStep({ name: 'form' });
      router.refresh();
      return;
    }

    const confirmed = await fetch(`/api/videos/${ticket.video.id}/uploaded`, { method: 'POST' });

    if (!confirmed.ok) {
      const body = await confirmed.json().catch(() => ({ message: 'Failed to confirm the upload' }));
      setError(body.message ?? 'Failed to confirm the upload');
      setStep({ name: 'form' });
      router.refresh();
      return;
    }

    setStep({ name: 'done', video: await confirmed.json() });
    // The catalogue table above is server-rendered, so the new row only appears after a
    // refresh — the same mechanism every other mutation in this app uses.
    router.refresh();
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-4 p-6 text-left"
      >
        <div>
          <h2 className="text-base font-semibold">Add a video</h2>
          <p className="text-sm text-gray-600">
            The file uploads straight to storage, then queues for processing. Where you file it
            in the curriculum decides which schools can be entitled to it.
          </p>
        </div>
        {isOpen ? (
          <ChevronDown className="h-5 w-5 shrink-0 text-gray-400" aria-hidden="true" />
        ) : (
          <ChevronRight className="h-5 w-5 shrink-0 text-gray-400" aria-hidden="true" />
        )}
      </button>

      {isOpen && (
        <div className="space-y-4 border-t border-gray-200 p-6">
          {step.name === 'form' && (
            <VideoMetadataForm
              curricula={curricula}
              isSubmitting={false}
              onSubmit={handleSubmit}
            />
          )}

          {step.name === 'uploading' && (
            <UploadProgressBar percent={step.percent} label={`Uploading “${step.title}”`} />
          )}

          {step.name === 'done' && (
            <div className="space-y-3">
              <p className="text-sm text-gray-700">
                <span className="font-medium">{step.video.title}</span> uploaded and queued for
                processing.
              </p>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setStep({ name: 'form' });
                }}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-gray-100"
              >
                Add another
              </button>
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}
