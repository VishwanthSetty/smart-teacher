'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { User } from '@smart-teacher/shared-types';

export function TeacherRowActions({ teacher }: { teacher: User }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function viewPassword() {
    setError(null);
    const response = await fetch(`/api/teachers/${teacher.id}/password`);
    const body = await response.json();
    if (!response.ok) return setError(body.message ?? 'Failed to read password');
    window.alert(body.password ? `Password: ${body.password}` : 'No admin-readable password is available.');
  }

  async function resetPassword() {
    const password = window.prompt('New password (leave blank to generate one):', '');
    if (password === null || !window.confirm(`Reset ${teacher.name}'s password and sign them out everywhere?`)) return;
    setError(null);
    const response = await fetch(`/api/teachers/${teacher.id}/password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: password || undefined }),
    });
    const body = await response.json();
    if (!response.ok) return setError(body.message ?? 'Failed to reset password');
    window.alert(`New password: ${body.password}`);
    router.refresh();
  }

  return (
    <div className="flex items-center justify-end gap-2">
      {error && <span className="text-sm text-red-600">{error}</span>}
      <button type="button" onClick={() => void viewPassword()} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-gray-100">
        View password
      </button>
      <button type="button" onClick={() => void resetPassword()} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-gray-100">
        Reset password
      </button>
    </div>
  );
}
