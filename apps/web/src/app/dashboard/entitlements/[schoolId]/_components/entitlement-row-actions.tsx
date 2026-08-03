'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function EntitlementRowActions({
  schoolId,
  entitlementId,
  label,
}: {
  schoolId: string;
  entitlementId: string;
  label: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleRevoke() {
    // Revoking narrows what every teacher and student in the school can watch, so the
    // pair being removed is named in the prompt rather than a generic "this entitlement".
    if (!window.confirm(`Revoke access to ${label}? Teachers and students lose this content.`)) {
      return;
    }

    setError(null);
    setIsSubmitting(true);
    const response = await fetch(`/api/schools/${schoolId}/entitlements/${entitlementId}`, {
      method: 'DELETE',
    });
    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({ message: 'Failed to revoke access' }));
      setError(body.message ?? 'Failed to revoke access');
      return;
    }

    router.refresh();
  }

  return (
    <div className="flex items-center justify-end gap-2">
      {error && <p className="max-w-xs text-right text-xs text-red-600">{error}</p>}
      <button
        type="button"
        onClick={handleRevoke}
        disabled={isSubmitting}
        className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-gray-100 disabled:opacity-50"
      >
        {isSubmitting ? '…' : 'Revoke'}
      </button>
    </div>
  );
}
