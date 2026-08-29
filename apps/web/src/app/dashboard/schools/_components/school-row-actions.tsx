'use client';

import Link from 'next/link';
import { MoreVertical, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SchoolStatus } from '@smart-teacher/shared-types';
import { Button } from '@/components/ui/button';

export function SchoolRowActions({ id, name, status }: { id: string; name: string; status: SchoolStatus }) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const nextStatus = status === SchoolStatus.ACTIVE ? SchoolStatus.SUSPENDED : SchoolStatus.ACTIVE;

  async function updateStatus() {
    setIsSubmitting(true);
    const response = await fetch(`/api/schools/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: nextStatus }),
    });
    setIsSubmitting(false);
    if (response.ok) {
      setIsConfirming(false);
      router.refresh();
    }
  }

  return (
    <>
      <details className="relative inline-block text-left">
        <summary className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-lg text-ink-muted hover:bg-brand-tint hover:text-brand-navy">
          <MoreVertical className="h-4 w-4" />
          <span className="sr-only">School actions</span>
        </summary>
        <div className="absolute right-0 z-10 mt-1 w-44 rounded-lg border border-surface-border bg-white p-1 text-left shadow-overlay">
          <Link href={`/dashboard/entitlements/${id}`} className="block rounded-md px-3 py-2 text-sm text-ink hover:bg-brand-tint">View entitlements</Link>
          <button className="block w-full rounded-md px-3 py-2 text-left text-sm text-ink hover:bg-brand-tint" type="button">Edit details</button>
          <button
            type="button"
            onClick={() => setIsConfirming(true)}
            className={`block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-red-50 ${status === SchoolStatus.ACTIVE ? 'text-status-danger' : 'text-status-success'}`}
          >
            {status === SchoolStatus.ACTIVE ? 'Suspend school' : 'Reactivate school'}
          </button>
        </div>
      </details>

      {isConfirming ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-card bg-white p-6 text-left shadow-overlay">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-status-danger"><TriangleAlert className="h-6 w-6" /></span>
            <h2 className="mt-4 text-lg font-semibold text-ink">{status === SchoolStatus.ACTIVE ? `Suspend ${name}?` : `Reactivate ${name}?`}</h2>
            <p className="mt-2 text-sm text-ink-muted">
              {status === SchoolStatus.ACTIVE
                ? 'Everyone at this school is signed out immediately and cannot sign back in.'
                : 'School users will be able to sign in again immediately.'}
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setIsConfirming(false)}>Cancel</Button>
              <Button variant={status === SchoolStatus.ACTIVE ? 'danger' : 'primary'} disabled={isSubmitting} onClick={updateStatus}>
                {isSubmitting ? 'Saving…' : status === SchoolStatus.ACTIVE ? 'Suspend school' : 'Reactivate school'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
