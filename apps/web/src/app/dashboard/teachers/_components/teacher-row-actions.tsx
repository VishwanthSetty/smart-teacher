'use client';

import Link from 'next/link';
import { KeyRound, MoreHorizontal, RefreshCw, UserRound } from 'lucide-react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { User } from '@smart-teacher/shared-types';

export function TeacherRowActions({ teacher }: { teacher: User }) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function viewPassword(): Promise<void> {
    setMessage(null);
    const response = await fetch(`/api/teachers/${teacher.id}/password`);
    const body = await response.json();
    setMessage(response.ok ? (body.password ? `Password: ${body.password}` : 'No readable password is available.') : body.message ?? 'Failed to read password');
  }

  async function resetPassword(): Promise<void> {
    const password = window.prompt('New password (leave blank to generate one):', '');
    if (password === null || !window.confirm(`Reset ${teacher.name}'s password and sign them out everywhere?`)) return;
    setIsSubmitting(true);
    const response = await fetch(`/api/teachers/${teacher.id}/password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: password || undefined }),
    });
    const body = await response.json();
    setIsSubmitting(false);
    setMessage(response.ok ? `New password: ${body.password}` : body.message ?? 'Failed to reset password');
    if (response.ok) router.refresh();
  }

  async function resendInvite(): Promise<void> {
    setIsSubmitting(true);
    setMessage(null);
    const response = await fetch(`/api/users/${teacher.id}/resend-invite`, { method: 'POST' });
    const body = response.ok ? null : await response.json().catch(() => ({ message: 'Failed to resend invite' }));
    setIsSubmitting(false);
    setMessage(response.ok ? 'Invite resent.' : body?.message ?? 'Failed to resend invite');
  }

  return (
    <div className="relative flex items-center justify-end">
      {message ? <span className="mr-2 max-w-44 text-right text-xs text-ink-muted">{message}</span> : null}
      <button type="button" onClick={() => setIsOpen((value) => !value)} className="rounded-lg p-2 text-ink-muted hover:bg-brand-tint hover:text-brand-navy" aria-label={`Actions for ${teacher.name}`} aria-expanded={isOpen}>
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {isOpen ? (
        <div className="absolute right-0 top-10 z-20 w-56 overflow-hidden rounded-card border border-surface-border bg-white py-1 shadow-overlay">
          <Link href={`/dashboard/teachers/${teacher.id}`} className="flex items-center gap-2 px-3 py-2 text-sm text-ink hover:bg-brand-tint"><UserRound className="h-4 w-4" /> View profile</Link>
          <Link href={`/dashboard/teachers/${teacher.id}#assignments`} className="flex items-center gap-2 px-3 py-2 text-sm text-ink hover:bg-brand-tint"><RefreshCw className="h-4 w-4" /> Manage assignments</Link>
          {teacher.status === 'PENDING' ? <button type="button" disabled={isSubmitting} onClick={() => void resendInvite()} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink hover:bg-brand-tint disabled:opacity-50"><RefreshCw className="h-4 w-4" /> Resend invite</button> : null}
          <button type="button" onClick={() => void viewPassword()} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink hover:bg-brand-tint"><KeyRound className="h-4 w-4" /> View password</button>
          <button type="button" disabled={isSubmitting} onClick={() => void resetPassword()} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink hover:bg-brand-tint disabled:opacity-50"><KeyRound className="h-4 w-4" /> Reset password</button>
        </div>
      ) : null}
    </div>
  );
}
