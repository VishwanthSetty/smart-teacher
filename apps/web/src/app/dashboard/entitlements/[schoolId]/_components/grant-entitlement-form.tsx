'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { GradeLevel, Subject } from '@smart-teacher/shared-types';

export function GrantEntitlementForm({
  schoolId,
  gradeLevels,
  subjects,
}: {
  schoolId: string;
  gradeLevels: GradeLevel[];
  subjects: Subject[];
}) {
  const router = useRouter();
  const [gradeLevelId, setGradeLevelId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const response = await fetch(`/api/schools/${schoolId}/entitlements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gradeLevelId, subjectId }),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      // The API's 409 text ("already holds an entitlement", "subject is retired") is the
      // most useful thing to show, so it is surfaced unchanged rather than flattened.
      const body = await response.json().catch(() => ({ message: 'Failed to grant access' }));
      setError(body.message ?? 'Failed to grant access');
      return;
    }

    setGradeLevelId('');
    setSubjectId('');
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-medium">Grant access</h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="entitlementGradeLevel" className="block text-sm font-medium text-gray-700">
            Grade level
          </label>
          <select
            id="entitlementGradeLevel"
            required
            value={gradeLevelId}
            onChange={(e) => setGradeLevelId(e.target.value)}
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
          <label htmlFor="entitlementSubject" className="block text-sm font-medium text-gray-700">
            Subject
          </label>
          <select
            id="entitlementSubject"
            required
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
          >
            <option value="" disabled>
              Select a subject
            </option>
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
      >
        {isSubmitting ? 'Granting…' : 'Grant access'}
      </button>
    </form>
  );
}
