'use client';

import { FormEvent, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { UserStatus, type Section, type Student } from '@smart-teacher/shared-types';

export function StudentRowActions({ student, sections, compact = false }: { student: Student; sections: Section[]; compact?: boolean }) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [firstName, setFirstName] = useState(student.firstName ?? '');
  const [lastName, setLastName] = useState(student.lastName ?? '');
  const [rollNumber, setRollNumber] = useState(student.enrollment?.rollNumber ?? '');
  const [sectionId, setSectionId] = useState(student.enrollment?.sectionId ?? '');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const isDisabled = student.status === UserStatus.DISABLED;
  const statusLabel = isDisabled ? 'Reactivate' : 'Deactivate';
  const nextStatus = isDisabled ? UserStatus.ACTIVE : UserStatus.DISABLED;

  async function patchStudent(patch: Record<string, unknown>): Promise<boolean> {
    setError(null);
    setIsSubmitting(true);
    const response = await fetch(`/api/students/${student.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({ message: 'Failed to update student' }));
      setError(body.message ?? 'Failed to update student');
      return false;
    }
    return true;
  }

  async function handleEditSubmit(event: FormEvent) {
    event.preventDefault();
    const ok = await patchStudent({ firstName, lastName, rollNumber, sectionId });
    if (ok) {
      setIsEditing(false);
      router.refresh();
    }
  }

  async function handleStatusToggle() {
    const message =
      nextStatus === UserStatus.DISABLED
        ? `Deactivate ${student.name}? They will not be able to log in, but their record stays.`
        : `Reactivate ${student.name}?`;
    if (!window.confirm(message)) {
      return;
    }
    const ok = await patchStudent({ status: nextStatus });
    if (ok) {
      router.refresh();
    }
  }

  async function viewPassword() {
    const response = await fetch(`/api/students/${student.id}/password`);
    const body = await response.json();
    if (!response.ok) {
      setError(body.message ?? 'Failed to read password');
      return;
    }
    window.alert(body.password ? `Password: ${body.password}` : 'No admin-readable password is available.');
  }

  async function resetPassword() {
    const password = window.prompt('New password (leave blank to generate one):', '');
    if (password === null || !window.confirm(`Reset ${student.name}'s password and sign them out everywhere?`)) return;
    const response = await fetch(`/api/students/${student.id}/password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: password || undefined }),
    });
    const body = await response.json();
    if (!response.ok) {
      setError(body.message ?? 'Failed to reset password');
      return;
    }
    window.alert(`New password: ${body.password}`);
    router.refresh();
  }

  if (isEditing) {
    return (
      <form onSubmit={handleEditSubmit} className="flex flex-wrap items-center justify-end gap-2">
        <input
          type="text"
          required
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          placeholder="First name"
          className="w-24 rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-gray-500 focus:outline-none"
        />
        <input
          type="text"
          required
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          placeholder="Last name"
          className="w-24 rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-gray-500 focus:outline-none"
        />
        <input
          type="text"
          value={rollNumber}
          onChange={(e) => setRollNumber(e.target.value)}
          placeholder="Roll no"
          className="w-20 rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-gray-500 focus:outline-none"
        />
        <select
          value={sectionId}
          onChange={(e) => setSectionId(e.target.value)}
          className="rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-gray-500 focus:outline-none"
        >
          {sections.map((section) => (
            <option key={section.id} value={section.id}>
              {section.label}
            </option>
          ))}
        </select>
        {error && <p className="w-full text-right text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
        >
          {isSubmitting ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={() => setIsEditing(false)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-gray-100"
        >
          Cancel
        </button>
      </form>
    );
  }

  if (compact) {
    return (
      <div className="relative">
        <button type="button" onClick={() => setIsMenuOpen((value) => !value)} className="rounded-lg p-2 text-ink-muted hover:bg-brand-tint" aria-label={`Actions for ${student.name}`}><MoreHorizontal className="h-4 w-4" /></button>
        {isMenuOpen ? <div className="absolute right-0 top-9 z-20 w-44 rounded-card border border-surface-border bg-white py-1 shadow-overlay">{error ? <p className="px-3 py-2 text-xs text-status-danger">{error}</p> : null}<button type="button" onClick={() => void viewPassword()} className="block w-full px-3 py-2 text-left text-sm hover:bg-brand-tint">View password</button><button type="button" onClick={() => void resetPassword()} className="block w-full px-3 py-2 text-left text-sm hover:bg-brand-tint">Reset password</button><button type="button" onClick={() => { setIsEditing(true); setIsMenuOpen(false); }} className="block w-full px-3 py-2 text-left text-sm hover:bg-brand-tint">Edit</button><button type="button" onClick={() => void handleStatusToggle()} className="block w-full px-3 py-2 text-left text-sm text-status-danger hover:bg-red-50">{statusLabel}</button></div> : null}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-end gap-2">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="button" onClick={() => void viewPassword()} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-gray-100">
        View password
      </button>
      <button type="button" onClick={() => void resetPassword()} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-gray-100">
        Reset password
      </button>
      <button
        type="button"
        onClick={() => setIsEditing(true)}
        className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-gray-100"
      >
        Edit
      </button>
      <button
        type="button"
        onClick={handleStatusToggle}
        disabled={isSubmitting}
        className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-gray-100 disabled:opacity-50"
      >
        {isSubmitting ? '…' : statusLabel}
      </button>
    </div>
  );
}
