'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { GradeLevel } from '@smart-teacher/shared-types';

export function CreateSectionForm({ gradeLevels }: { gradeLevels: GradeLevel[] }) {
  const router = useRouter();
  const [gradeLevelId, setGradeLevelId] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const response = await fetch('/api/sections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gradeLevelId, name }),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({ message: 'Failed to create section' }));
      setError(body.message ?? 'Failed to create section');
      return;
    }

    setGradeLevelId('');
    setName('');
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-medium">Create a section</h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="gradeLevelId" className="block text-sm font-medium text-gray-700">
            Grade level
          </label>
          <select
            id="gradeLevelId"
            required
            value={gradeLevelId}
            onChange={(event) => setGradeLevelId(event.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
          >
            <option value="" disabled>
              Select a grade level
            </option>
            {gradeLevels.map((gradeLevel) => (
              <option key={gradeLevel.id} value={gradeLevel.id}>
                {gradeLevel.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label htmlFor="sectionName" className="block text-sm font-medium text-gray-700">
            Section name
          </label>
          <input
            id="sectionName"
            type="text"
            required
            placeholder="A"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
          />
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-gray-100 disabled:opacity-50"
      >
        {isSubmitting ? 'Creating…' : 'Create section'}
      </button>
    </form>
  );
}
