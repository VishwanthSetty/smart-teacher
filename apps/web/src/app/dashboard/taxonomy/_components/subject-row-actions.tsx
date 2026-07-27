'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SubjectStatus } from '@smart-teacher/shared-types';

export function SubjectRowActions({ id, status }: { id: string; status: SubjectStatus }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isActive = status === SubjectStatus.ACTIVE;
  const nextStatus = isActive ? SubjectStatus.RETIRED : SubjectStatus.ACTIVE;
  const label = isActive ? 'Retire' : 'Reactivate';

  async function handleClick() {
    setError(null);
    setIsSubmitting(true);

    const response = await fetch(`/api/subjects/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: nextStatus }),
    });

    setIsSubmitting(false);

    // Unlike the school suspend toggle, this can legitimately be refused: retiring 409s
    // while a video or school entitlement still references the subject. The operator
    // needs the API's reason, so failure cannot be swallowed here.
    if (!response.ok) {
      const body = await response.json().catch(() => ({ message: `Failed to ${label.toLowerCase()} subject` }));
      setError(body.message ?? `Failed to ${label.toLowerCase()} subject`);
      return;
    }

    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={isSubmitting}
        className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-gray-100 disabled:opacity-50"
      >
        {isSubmitting ? '…' : label}
      </button>
      {error && <p className="max-w-xs text-right text-xs text-red-600">{error}</p>}
    </div>
  );
}
