'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ACCEPTED_VIDEO_CONTENT_TYPES, MAX_VIDEO_BYTES,
  type AdminVideoDetail, type ContentImpact, type GradeLevel, type Subject, type UpdateVideoInput,
} from '@smart-teacher/shared-types';

export interface VideoMetadataSubmission {
  title: string; description?: string; gradeLevelId: string; subjectId: string; file: File;
}

type Props =
  | { video: AdminVideoDetail; gradeLevels: GradeLevel[]; subjects: Subject[] }
  | { video?: never; gradeLevels: GradeLevel[]; subjects: Subject[]; isSubmitting: boolean; onSubmit: (submission: VideoMetadataSubmission) => void | Promise<void> };

export function VideoMetadataForm(props: Props) {
  const { gradeLevels, subjects } = props;
  const video = props.video;
  const router = useRouter();
  const [impact, setImpact] = useState<ContentImpact | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function previewImpact(gradeLevelId: string, subjectId: string) {
    if (!video || (gradeLevelId === video.gradeLevelId && subjectId === video.subjectId)) { setImpact(null); return; }
    const response = await fetch(`/api/content-impact?${new URLSearchParams({ gradeLevelId, subjectId })}`);
    if (response.ok) setImpact(await response.json() as ContentImpact);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null);
    const data = new FormData(event.currentTarget);
    if (!video) {
      const file = data.get('file');
      if (!(file instanceof File) || file.size === 0) { setError('Choose an MP4 or MOV video.'); setBusy(false); return; }
      if (!(ACCEPTED_VIDEO_CONTENT_TYPES as readonly string[]).includes(file.type)) { setError('Only MP4 and MOV videos can be uploaded.'); setBusy(false); return; }
      if (file.size > MAX_VIDEO_BYTES) { setError('That file is larger than the 2 GB limit.'); setBusy(false); return; }
      await props.onSubmit({ title: String(data.get('title')), description: String(data.get('description') || '') || undefined, gradeLevelId: String(data.get('gradeLevelId')), subjectId: String(data.get('subjectId')), file });
      setBusy(false); return;
    }
    const retain = data.get('retainSource');
    const input: UpdateVideoInput = {
      title: String(data.get('title') ?? ''), description: String(data.get('description') ?? ''),
      gradeLevelId: String(data.get('gradeLevelId') ?? ''), subjectId: String(data.get('subjectId') ?? ''),
      retainSource: retain === 'default' ? null : retain === 'true',
    };
    const response = await fetch(`/api/videos/${video.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
    setBusy(false);
    if (!response.ok) { const body = await response.json().catch(() => ({})); setError(body.message ?? 'Update failed'); return; }
    setImpact(null); router.refresh();
  }

  if (!video) return <form onSubmit={submit} className="grid gap-4">
    <label className="grid gap-1 text-sm">Title<input required name="title" className="rounded border px-3 py-2" /></label>
    <label className="grid gap-1 text-sm">Description<textarea name="description" className="rounded border px-3 py-2" /></label>
    <div className="grid gap-4 md:grid-cols-2"><label className="grid gap-1 text-sm">Grade<select required name="gradeLevelId" className="rounded border px-3 py-2"><option value="">Choose grade</option>{gradeLevels.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label><label className="grid gap-1 text-sm">Subject<select required name="subjectId" className="rounded border px-3 py-2"><option value="">Choose subject</option>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label></div>
    <label className="grid gap-1 text-sm">Video file<input required name="file" type="file" accept="video/mp4,video/quicktime,.mp4,.mov" /></label>
    {error && <p className="text-sm text-red-600">{error}</p>}<button disabled={busy || props.isSubmitting} className="w-fit rounded bg-gray-900 px-4 py-2 text-white disabled:opacity-50">Create and upload</button>
  </form>;

  return <form onSubmit={submit} onChange={(event) => { const form = event.currentTarget; void previewImpact((form.elements.namedItem('gradeLevelId') as HTMLSelectElement).value, (form.elements.namedItem('subjectId') as HTMLSelectElement).value); }} className="grid gap-4 rounded-lg border bg-white p-5">
    <label className="grid gap-1 text-sm">Title<input required name="title" defaultValue={video.title} className="rounded border px-3 py-2" /></label>
    <label className="grid gap-1 text-sm">Description<textarea name="description" defaultValue={video.description ?? ''} className="rounded border px-3 py-2" /></label>
    <div className="grid gap-4 md:grid-cols-2"><label className="grid gap-1 text-sm">Grade<select name="gradeLevelId" defaultValue={video.gradeLevelId} className="rounded border px-3 py-2">{gradeLevels.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label><label className="grid gap-1 text-sm">Subject<select name="subjectId" defaultValue={video.subjectId} className="rounded border px-3 py-2">{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label></div>
    <label className="grid gap-1 text-sm">Ingest source retention<select name="retainSource" defaultValue={video.retainSource === null ? 'default' : String(video.retainSource)} className="rounded border px-3 py-2"><option value="default">Use global default</option><option value="true">Retain source</option><option value="false">Delete after success</option></select></label>
    <p className="text-xs text-gray-500">Deleting the source saves storage but disables Retry for this video.</p>
    {impact && <p className="rounded bg-amber-50 p-3 text-sm">The new classification reaches {impact.schoolCount} schools and {impact.studentCount} active students, alongside {impact.videoCount} existing videos.</p>}
    {error && <p className="text-sm text-red-600">{error}</p>}<button disabled={busy} className="w-fit rounded bg-gray-900 px-4 py-2 text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save metadata'}</button>
  </form>;
}
