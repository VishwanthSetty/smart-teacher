'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ACCEPTED_VIDEO_CONTENT_TYPES,
  MAX_VIDEO_BYTES,
  VideoStatus,
  type VideoUploadTicket,
} from '@smart-teacher/shared-types';
import { uploadWithProgress } from './upload-with-progress';

interface VideoRowActionsProps {
  id: string;
  title: string;
  status: VideoStatus;
}

const BUTTON_CLASS =
  'rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-gray-100 disabled:opacity-50';

export function VideoRowActions({ id, title, status }: VideoRowActionsProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [percent, setPercent] = useState<number | null>(null);

  // Only an upload that never finished can be retried or removed here. A READY video is
  // live content that schools may be entitled to, and a PROCESSING one has a worker
  // writing its output — the API 409s on both, and hiding the buttons keeps the UI honest
  // about that.
  const isAwaitingUpload = status === VideoStatus.UPLOADING || status === VideoStatus.FAILED;
  // A failure is as often the worker as the file, and the source is still in the bucket —
  // so offer the cheap fix before asking anyone to re-send 2 GB.
  const canRetranscode = status === VideoStatus.FAILED;

  async function handleRetry(file: File) {
    setError(null);

    if (!(ACCEPTED_VIDEO_CONTENT_TYPES as readonly string[]).includes(file.type)) {
      setError('Only MP4 and MOV videos can be uploaded.');
      return;
    }
    if (file.size > MAX_VIDEO_BYTES) {
      setError('That file is larger than the 2 GB limit.');
      return;
    }

    setIsBusy(true);
    setPercent(0);

    const ticketResponse = await fetch(`/api/videos/${id}/upload-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contentType: file.type, sizeBytes: file.size }),
    });

    if (!ticketResponse.ok) {
      const body = await ticketResponse.json().catch(() => ({ message: 'Failed to retry' }));
      setError(body.message ?? 'Failed to retry');
      setIsBusy(false);
      setPercent(null);
      return;
    }

    const ticket: VideoUploadTicket = await ticketResponse.json();

    try {
      await uploadWithProgress({
        url: ticket.uploadUrl,
        file,
        contentType: file.type,
        onProgress: (progress) => setPercent(progress.percent),
      });

      const confirmed = await fetch(`/api/videos/${id}/uploaded`, { method: 'POST' });
      if (!confirmed.ok) {
        const body = await confirmed.json().catch(() => ({ message: 'Failed to confirm' }));
        setError(body.message ?? 'Failed to confirm');
      }
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Upload failed');
    } finally {
      setIsBusy(false);
      setPercent(null);
      router.refresh();
    }
  }

  async function handleRetranscode() {
    setError(null);
    setIsBusy(true);

    const response = await fetch(`/api/videos/${id}/retranscode`, { method: 'POST' });

    setIsBusy(false);

    if (!response.ok) {
      const body = await response
        .json()
        .catch(() => ({ message: 'Failed to restart transcoding' }));
      setError(body.message ?? 'Failed to restart transcoding');
      return;
    }

    router.refresh();
  }

  async function handleDelete() {
    setError(null);
    setIsBusy(true);

    const response = await fetch(`/api/videos/${id}`, { method: 'DELETE' });

    setIsBusy(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({ message: 'Failed to delete the video' }));
      setError(body.message ?? 'Failed to delete the video');
      return;
    }

    router.refresh();
  }

  if (!isAwaitingUpload) {
    return null;
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center justify-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="video/mp4,video/quicktime,.mp4,.mov"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            // Reset so choosing the same file twice still fires a change event.
            event.target.value = '';
            if (file) {
              void handleRetry(file);
            }
          }}
        />
        <button
          type="button"
          disabled={isBusy}
          onClick={() => fileInputRef.current?.click()}
          className={BUTTON_CLASS}
        >
          {percent === null ? 'Retry upload' : `Uploading ${percent}%`}
        </button>
        {canRetranscode && (
          <button
            type="button"
            disabled={isBusy}
            onClick={() => void handleRetranscode()}
            className={BUTTON_CLASS}
            aria-label={`Retry transcoding ${title}`}
          >
            Retry transcode
          </button>
        )}
        <button
          type="button"
          disabled={isBusy}
          onClick={handleDelete}
          className={`${BUTTON_CLASS} text-red-700`}
          aria-label={`Delete ${title}`}
        >
          Delete
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
