'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SchoolStatus } from '@smart-teacher/shared-types';

export function SchoolRowActions({ id, status }: { id: string; status: SchoolStatus }) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const nextStatus =
    status === SchoolStatus.ACTIVE ? SchoolStatus.SUSPENDED : SchoolStatus.ACTIVE;
  const label = status === SchoolStatus.ACTIVE ? 'Suspend' : 'Reactivate';

  async function handleClick() {
    setIsSubmitting(true);
    const response = await fetch(`/api/schools/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: nextStatus }),
    });
    setIsSubmitting(false);

    if (response.ok) {
      router.refresh();
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isSubmitting}
      className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-gray-100 disabled:opacity-50"
    >
      {isSubmitting ? '…' : label}
    </button>
  );
}
