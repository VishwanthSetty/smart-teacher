'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { GradeLevel } from '@smart-teacher/shared-types';

export function GradeLevelRow({ gradeLevel }: { gradeLevel: GradeLevel }) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(gradeLevel.name);
  const [rank, setRank] = useState(String(gradeLevel.rank));
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleCancel() {
    setName(gradeLevel.name);
    setRank(String(gradeLevel.rank));
    setError(null);
    setIsEditing(false);
  }

  async function handleSave() {
    setError(null);
    setIsSubmitting(true);

    const response = await fetch(`/api/grade-levels/${gradeLevel.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, rank: Number(rank) }),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response
        .json()
        .catch(() => ({ message: 'Failed to update grade level' }));
      setError(body.message ?? 'Failed to update grade level');
      return;
    }

    setIsEditing(false);
    router.refresh();
  }

  async function handleDelete() {
    if (!window.confirm('Delete this grade level?')) {
      return;
    }

    setError(null);
    setIsSubmitting(true);
    const response = await fetch(`/api/grade-levels/${gradeLevel.id}`, { method: 'DELETE' });
    setIsSubmitting(false);

    // Both save and delete can legitimately be refused: the API 409s while a video,
    // entitlement or section still references the grade level, or the new name/rank
    // collides with another. The operator needs that reason, so it isn't swallowed here.
    if (!response.ok) {
      const body = await response
        .json()
        .catch(() => ({ message: 'Failed to delete grade level' }));
      setError(body.message ?? 'Failed to delete grade level');
      return;
    }

    router.refresh();
  }

  if (isEditing) {
    return (
      <tr className="border-b border-gray-100 last:border-0">
        <td className="px-4 py-3">
          <input
            type="text"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-gray-500 focus:outline-none"
          />
        </td>
        <td className="px-4 py-3">
          <input
            type="number"
            required
            min={1}
            step={1}
            value={rank}
            onChange={(event) => setRank(event.target.value)}
            className="w-24 rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-gray-500 focus:outline-none"
          />
        </td>
        <td className="px-4 py-3">
          <div className="flex flex-col items-end gap-1">
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={isSubmitting}
                className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
              >
                {isSubmitting ? '…' : 'Save'}
              </button>
              <button
                type="button"
                onClick={handleCancel}
                disabled={isSubmitting}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-gray-100 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
            {error && <p className="max-w-xs text-right text-xs text-red-600">{error}</p>}
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-gray-100 last:border-0">
      <td className="px-4 py-3 font-medium">{gradeLevel.name}</td>
      <td className="px-4 py-3 text-gray-600">{gradeLevel.rank}</td>
      <td className="px-4 py-3">
        <div className="flex flex-col items-end gap-1">
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              disabled={isSubmitting}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-gray-100 disabled:opacity-50"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={isSubmitting}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-gray-100 disabled:opacity-50"
            >
              {isSubmitting ? '…' : 'Delete'}
            </button>
          </div>
          {error && <p className="max-w-xs text-right text-xs text-red-600">{error}</p>}
        </div>
      </td>
    </tr>
  );
}
