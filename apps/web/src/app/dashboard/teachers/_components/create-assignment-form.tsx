'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Section, Subject } from '@smart-teacher/shared-types';

const ALL_SECTIONS_VALUE = '';

export function CreateAssignmentForm({
  teacherId,
  sections,
  subjects,
}: {
  teacherId: string;
  sections: Section[];
  subjects: Subject[];
}) {
  const router = useRouter();
  const [sectionId, setSectionId] = useState(ALL_SECTIONS_VALUE);
  const [subjectId, setSubjectId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const response = await fetch('/api/teacher-assignments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        teacherId,
        subjectId,
        ...(sectionId ? { sectionId } : {}),
      }),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({ message: 'Failed to create assignment' }));
      setError(body.message ?? 'Failed to create assignment');
      return;
    }

    setSectionId(ALL_SECTIONS_VALUE);
    setSubjectId('');
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="h-full space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-medium">Assign a subject</h2>

      <div className="space-y-1">
        <label htmlFor="assignmentSubject" className="block text-sm font-medium text-gray-700">
          Subject
        </label>
        <select
          id="assignmentSubject"
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

      <div className="space-y-1">
        <label htmlFor="assignmentSection" className="block text-sm font-medium text-gray-700">
          Section
        </label>
        <select
          id="assignmentSection"
          value={sectionId}
          onChange={(e) => setSectionId(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
        >
          <option value={ALL_SECTIONS_VALUE}>All sections (no specific section)</option>
          {sections.map((section) => (
            <option key={section.id} value={section.id}>
              {section.label}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
      >
        {isSubmitting ? 'Assigning…' : 'Assign'}
      </button>
    </form>
  );
}
