'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

export function CreateSubjectForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const response = await fetch('/api/subjects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, code }),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({ message: 'Failed to create subject' }));
      setError(body.message ?? 'Failed to create subject');
      return;
    }

    setName('');
    setCode('');
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
    >
      <h2 className="text-lg font-medium">Add a subject</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="name" className="block text-sm font-medium text-gray-700">
            Subject name
          </label>
          <input
            id="name"
            type="text"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="code" className="block text-sm font-medium text-gray-700">
            Code
          </label>
          {/* Echoes the API's validation rule so a typo is caught before the round trip;
              the API stays the real validator. Not editable afterwards. */}
          <input
            id="code"
            type="text"
            required
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            placeholder="maths"
            title="Lowercase, alphanumeric, and hyphen-separated"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm focus:border-gray-500 focus:outline-none"
          />
          <p className="text-xs text-gray-500">
            Permanent — videos, entitlements and timetables all join on it.
          </p>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
      >
        {isSubmitting ? 'Adding…' : 'Add subject'}
      </button>
    </form>
  );
}
