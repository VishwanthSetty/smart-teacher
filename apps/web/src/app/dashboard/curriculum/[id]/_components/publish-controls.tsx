'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CurriculumStatus } from '@smart-teacher/shared-types';
import { Button } from '@/components/ui/button';

export function PublishControls({ id, status }: { id: string; status: CurriculumStatus }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function transition(action: 'publish' | 'unpublish') {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/curricula/${id}/${action}`, { method: 'POST' });
    setBusy(false);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.message ?? `Could not ${action}`);
      return;
    }
    router.refresh();
  }
  return (
    <div className="flex flex-wrap items-center gap-3">
      {status === CurriculumStatus.PUBLISHED ? <Button variant="secondary" disabled={busy} onClick={() => transition('unpublish')}>Unpublish</Button> : status === CurriculumStatus.DRAFT ? <Button disabled={busy} onClick={() => transition('publish')}>Publish curriculum</Button> : <span className="text-sm text-ink-muted">Archived curricula cannot be published.</span>}
      {error ? <span className="text-sm text-status-danger">{error}</span> : null}
    </div>
  );
}
