'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PasswordInput } from '@/components/ui/password-input';

export function CreateSchoolForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [academicYear, setAcademicYear] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [sendInvite, setSendInvite] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!adminPassword && !sendInvite) {
      setError('Set an initial password or send an invite email so the admin can sign in');
      return;
    }

    setIsSubmitting(true);

    const response = await fetch('/api/schools', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        slug,
        academicYear,
        adminEmail,
        adminName,
        ...(adminPassword ? { adminPassword } : {}),
        sendInvite,
      }),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({ message: 'Failed to create school' }));
      setError(body.message ?? 'Failed to create school');
      return;
    }

    setName('');
    setSlug('');
    setAcademicYear('');
    setAdminEmail('');
    setAdminName('');
    setAdminPassword('');
    setSendInvite(true);
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
    >
      <h2 className="text-lg font-medium">Provision a school</h2>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="name" className="block text-sm font-medium text-gray-700">
            School name
          </label>
          <input
            id="name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="slug" className="block text-sm font-medium text-gray-700">
            Slug
          </label>
          <input
            id="slug"
            type="text"
            required
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="springfield-high"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="academicYear" className="block text-sm font-medium text-gray-700">
            Academic year
          </label>
          <input
            id="academicYear"
            type="text"
            required
            value={academicYear}
            onChange={(e) => setAcademicYear(e.target.value)}
            placeholder="2025-2026"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="adminName" className="block text-sm font-medium text-gray-700">
            School admin name
          </label>
          <input
            id="adminName"
            type="text"
            required
            value={adminName}
            onChange={(e) => setAdminName(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
          />
        </div>

        <div className="space-y-1 sm:col-span-2">
          <label htmlFor="adminEmail" className="block text-sm font-medium text-gray-700">
            School admin email
          </label>
          <input
            id="adminEmail"
            type="email"
            required
            value={adminEmail}
            onChange={(e) => setAdminEmail(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
          />
        </div>

        <div className="space-y-1 sm:col-span-2">
          <label htmlFor="adminPassword" className="block text-sm font-medium text-gray-700">
            Initial password (optional)
          </label>
          <PasswordInput
            id="adminPassword"
            value={adminPassword}
            onChange={(e) => setAdminPassword(e.target.value)}
            minLength={8}
            placeholder="Leave blank to let the admin set one via the invite email"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={sendInvite}
              onChange={(e) => setSendInvite(e.target.checked)}
              className="rounded border-gray-300"
            />
            {adminPassword
              ? 'Email the admin a welcome notice'
              : 'Send invite email (required if no password is set)'}
          </label>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
      >
        {isSubmitting ? 'Creating…' : 'Create school'}
      </button>
    </form>
  );
}
