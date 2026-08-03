'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function AssignmentRowActions({ assignmentId }: { assignmentId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleRemove() {
    // No published-timetable warning yet — there is no Timetable model to check
    // against (F-09). This confirm is the only guard until that lands.
    if (!window.confirm('Remove this assignment?')) {
      return;
    }

    setError(null);
    setIsSubmitting(true);
    const response = await fetch(`/api/teacher-assignments/${assignmentId}`, { method: 'DELETE' });
    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({ message: 'Failed to remove assignment' }));
      setError(body.message ?? 'Failed to remove assignment');
      return;
    }

    router.refresh();
  }

  return (
    <div className="flex items-center justify-end gap-2">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="button"
        onClick={handleRemove}
        disabled={isSubmitting}
        className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-gray-100 disabled:opacity-50"
      >
        {isSubmitting ? '…' : 'Remove'}
      </button>
    </div>
  );
}
