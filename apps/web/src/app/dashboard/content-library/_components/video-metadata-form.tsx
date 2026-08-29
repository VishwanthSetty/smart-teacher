'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ACCEPTED_VIDEO_CONTENT_TYPES,
  MAX_VIDEO_BYTES,
  type AdminVideoDetail,
  type ContentImpact,
  type Curriculum,
  type UpdateVideoInput,
} from '@smart-teacher/shared-types';
import { ContentNodePicker } from '@/components/content/content-node-picker';

export interface VideoMetadataSubmission {
  title: string;
  description?: string;
  contentNodeId: string;
  file: File;
}

type Props =
  | { video: AdminVideoDetail; curricula: Curriculum[] }
  | { video?: never; curricula: Curriculum[]; isSubmitting: boolean; onSubmit: (submission: VideoMetadataSubmission) => void | Promise<void> };

export function VideoMetadataForm(props: Props) {
  const { curricula } = props;
  const video = props.video;
  const router = useRouter();
  const [impact, setImpact] = useState<ContentImpact | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function previewImpact(curriculumId: string) {
    if (!video || !curriculumId || curriculumId === video.curriculumId) {
      setImpact(null);
      return;
    }
    const response = await fetch(`/api/content-impact?${new URLSearchParams({ curriculumId })}`);
    if (response.ok) setImpact(await response.json() as ContentImpact);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    if (!video) {
      const file = data.get('file');
      if (!(file instanceof File) || file.size === 0) {
        setError('Choose an MP4 or MOV video.'); setBusy(false); return;
      }
      if (!(ACCEPTED_VIDEO_CONTENT_TYPES as readonly string[]).includes(file.type)) {
        setError('Only MP4 and MOV videos can be uploaded.'); setBusy(false); return;
      }
      if (file.size > MAX_VIDEO_BYTES) {
        setError('That file is larger than the 2 GB limit.'); setBusy(false); return;
      }
      const contentNodeId = String(data.get('contentNodeId') ?? '');
      if (!contentNodeId) {
        setError('Choose where this video belongs in the curriculum.'); setBusy(false); return;
      }
      await props.onSubmit({
        title: String(data.get('title')),
        description: String(data.get('description') || '') || undefined,
        contentNodeId,
        file,
      });
      setBusy(false);
      return;
    }

    const retain = data.get('retainSource');
    const input: UpdateVideoInput = {
      title: String(data.get('title') ?? ''),
      description: String(data.get('description') ?? ''),
      contentNodeId: String(data.get('contentNodeId') ?? '') || undefined,
      retainSource: retain === 'default' ? null : retain === 'true',
    };
    const response = await fetch(`/api/videos/${video.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    setBusy(false);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.message ?? 'Update failed');
      return;
    }
    setImpact(null);
    router.refresh();
  }

  if (!video) {
    return (
      <form onSubmit={submit} className="grid gap-4 lg:grid-cols-2">
        <label className="grid gap-1 text-sm font-medium text-ink">Title<input required name="title" className="field font-normal" /></label>
        <label className="grid gap-1 text-sm font-medium text-ink">Description<textarea name="description" className="min-h-20 rounded-lg border border-surface-border px-3 py-2 font-normal focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/15" /></label>
        <ContentNodePicker curricula={curricula} />
        <label className="grid gap-1 text-sm font-medium text-ink">Video file<input required name="file" type="file" accept="video/mp4,video/quicktime,.mp4,.mov" className="rounded-lg border border-dashed border-brand-soft bg-brand-tint/30 px-3 py-6 text-sm font-normal" /></label>
        {error ? <p className="text-sm text-status-danger">{error}</p> : null}
        <button disabled={busy || props.isSubmitting} className="h-10 w-fit rounded-lg bg-brand-blue px-4 text-sm font-medium text-white hover:bg-brand-navy disabled:opacity-50">Create and upload</button>
      </form>
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-4 rounded-card border border-surface-border bg-white p-5 shadow-card">
      <h2 className="font-semibold text-ink">Video details</h2>
      <label className="grid gap-1 text-sm font-medium text-ink">Title<input required name="title" defaultValue={video.title} className="field font-normal" /></label>
      <label className="grid gap-1 text-sm font-medium text-ink">Description<textarea name="description" defaultValue={video.description ?? ''} className="min-h-24 rounded-lg border border-surface-border px-3 py-2 font-normal focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/15" /></label>
      <ContentNodePicker
        curricula={curricula}
        defaultCurriculumId={video.curriculumId}
        defaultNodeId={video.contentNodeId}
        onChange={({ curriculumId }) => void previewImpact(curriculumId)}
      />
      <label className="grid gap-1 text-sm font-medium text-ink">Ingest source retention<select name="retainSource" defaultValue={video.retainSource === null ? 'default' : String(video.retainSource)} className="field font-normal"><option value="default">Use global default</option><option value="true">Retain source</option><option value="false">Delete after success</option></select></label>
      <p className="text-xs text-ink-muted">Deleting the source saves storage but disables Retry for this video.</p>
      {impact ? <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">The new curriculum reaches {impact.schoolCount} schools, {impact.studentCount} active students, and {impact.teacherCount} assigned teachers, alongside {impact.videoCount} videos and {impact.documentCount} documents.</p> : null}
      {error ? <p className="text-sm text-status-danger">{error}</p> : null}
      <button disabled={busy} className="ml-auto h-10 w-fit rounded-lg bg-brand-blue px-4 text-sm font-medium text-white hover:bg-brand-navy disabled:opacity-50">{busy ? 'Saving…' : 'Save changes'}</button>
    </form>
  );
}
