'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';

export function AssignmentRowActions({ assignmentId }: { assignmentId: string }) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  async function handleRemove(): Promise<void> {
    setError(null); setIsSubmitting(true);
    const response = await fetch(`/api/teacher-assignments/${assignmentId}`, { method: 'DELETE' });
    setIsSubmitting(false);
    if (!response.ok) { const body = await response.json().catch(() => ({ message: 'Failed to remove assignment' })); setError(body.message ?? 'Failed to remove assignment'); return; }
    setIsOpen(false); router.refresh();
  }
  return <>{error ? <span className="mr-2 text-xs text-status-danger">{error}</span> : null}<button type="button" onClick={() => setIsOpen(true)} className="rounded-lg px-3 py-2 text-sm font-medium text-status-danger hover:bg-red-50">Remove</button><ConfirmationDialog isOpen={isOpen} title="Remove teaching assignment?" description="The teacher will lose the library access granted by this assignment. Existing student and class records will not be changed." confirmLabel="Remove assignment" isDestructive isSubmitting={isSubmitting} onCancel={() => setIsOpen(false)} onConfirm={() => void handleRemove()} /></>;
}
