'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

export function CreateGradeLevelForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [rank, setRank] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const response = await fetch('/api/grade-levels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, rank: Number(rank) }),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response
        .json()
        .catch(() => ({ message: 'Failed to create grade level' }));
      setError(body.message ?? 'Failed to create grade level');
      return;
    }

    setName('');
    setRank('');
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
    >
      <h2 className="text-lg font-medium">Add a grade level</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="grade-level-name" className="block text-sm font-medium text-gray-700">
            Name
          </label>
          <input
            id="grade-level-name"
            type="text"
            required
            placeholder="Grade 5"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="grade-level-rank" className="block text-sm font-medium text-gray-700">
            Rank
          </label>
          <input
            id="grade-level-rank"
            type="number"
            required
            min={1}
            step={1}
            value={rank}
            onChange={(event) => setRank(event.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
          />
          <p className="text-xs text-gray-500">
            Display order across the platform — must be unique.
          </p>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
      >
        {isSubmitting ? 'Adding…' : 'Add grade level'}
      </button>
    </form>
  );
}
