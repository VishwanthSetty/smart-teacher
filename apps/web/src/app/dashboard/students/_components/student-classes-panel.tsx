'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Section, Student, StudentEnrollment } from '@smart-teacher/shared-types';

const INPUT_CLASS =
  'rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-gray-500 focus:outline-none';
const SECONDARY_BUTTON_CLASS =
  'rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-gray-100 disabled:opacity-50';

// A student may be in several classes at once; the student switches between them in the
// app, so the admin only adds, removes and numbers classes here — never picks the current one.
export function StudentClassesPanel({
  student,
  sections,
  onClose,
}: {
  student: Student;
  sections: Section[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const enrolledSectionIds = new Set(student.enrollments.map((enrollment) => enrollment.sectionId));
  const available = sections.filter((section) => !enrolledSectionIds.has(section.id));
  const [newSectionId, setNewSectionId] = useState(available[0]?.id ?? '');
  const [newRollNumber, setNewRollNumber] = useState('');

  async function send(path: string, init: RequestInit, fallback: string): Promise<boolean> {
    setError(null);
    setIsSubmitting(true);
    const response = await fetch(`/api/students/${student.id}/enrollments${path}`, init);
    setIsSubmitting(false);
    if (!response.ok) {
      const body = await response.json().catch(() => ({ message: fallback }));
      setError(body.message ?? fallback);
      return false;
    }
    router.refresh();
    return true;
  }

  async function handleAdd(event: FormEvent) {
    event.preventDefault();
    const ok = await send(
      '',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sectionId: newSectionId, rollNumber: newRollNumber || undefined }),
      },
      'Failed to add the class',
    );
    if (ok) {
      setNewRollNumber('');
    }
  }

  async function handleRemove(enrollment: StudentEnrollment) {
    const label = `${enrollment.gradeLevelName} - ${enrollment.sectionName}`;
    if (!window.confirm(`Remove ${student.name} from ${label}? Their history in that class is kept.`)) {
      return;
    }
    await send(`/${enrollment.id}`, { method: 'DELETE' }, 'Failed to remove the class');
  }

  return (
    <div className="w-full space-y-3 rounded-md border border-gray-200 bg-gray-50 p-3 text-left">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">Classes for {student.name}</h3>
        <button type="button" onClick={onClose} className="text-sm text-gray-600 hover:text-gray-900">
          Done
        </button>
      </div>

      {student.enrollments.length === 0 ? (
        <p className="text-sm text-gray-600">Not in any class yet.</p>
      ) : (
        <ul className="space-y-2">
          {student.enrollments.map((enrollment) => (
            <EnrollmentRow
              key={enrollment.id}
              enrollment={enrollment}
              isSubmitting={isSubmitting}
              onSaveRollNumber={(rollNumber) =>
                send(
                  `/${enrollment.id}`,
                  {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ rollNumber }),
                  },
                  'Failed to update the roll number',
                )
              }
              onRemove={() => void handleRemove(enrollment)}
            />
          ))}
        </ul>
      )}

      {available.length > 0 ? (
        <form onSubmit={handleAdd} className="flex flex-wrap items-center gap-2 border-t border-gray-200 pt-3">
          <select value={newSectionId} onChange={(e) => setNewSectionId(e.target.value)} className={INPUT_CLASS}>
            {available.map((section) => (
              <option key={section.id} value={section.id}>
                {section.label}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={newRollNumber}
            onChange={(e) => setNewRollNumber(e.target.value)}
            placeholder="Roll no"
            className={`w-20 ${INPUT_CLASS}`}
          />
          <button
            type="submit"
            disabled={isSubmitting || !newSectionId}
            className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
          >
            Add class
          </button>
        </form>
      ) : null}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

function EnrollmentRow({
  enrollment,
  isSubmitting,
  onSaveRollNumber,
  onRemove,
}: {
  enrollment: StudentEnrollment;
  isSubmitting: boolean;
  onSaveRollNumber: (rollNumber: string) => Promise<boolean>;
  onRemove: () => void;
}) {
  const [rollNumber, setRollNumber] = useState(enrollment.rollNumber ?? '');
  const isDirty = rollNumber !== (enrollment.rollNumber ?? '');

  return (
    <li className="flex flex-wrap items-center gap-2 text-sm">
      <span className="min-w-[8rem] font-medium text-gray-900">
        {enrollment.gradeLevelName} - {enrollment.sectionName}
      </span>
      {enrollment.isCurrent ? (
        <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-700">Current</span>
      ) : null}
      <input
        type="text"
        value={rollNumber}
        onChange={(e) => setRollNumber(e.target.value)}
        placeholder="Roll no"
        aria-label={`Roll number in ${enrollment.gradeLevelName} - ${enrollment.sectionName}`}
        className={`w-20 ${INPUT_CLASS}`}
      />
      {isDirty ? (
        <button type="button" disabled={isSubmitting} onClick={() => void onSaveRollNumber(rollNumber)} className={SECONDARY_BUTTON_CLASS}>
          Save
        </button>
      ) : null}
      <button type="button" disabled={isSubmitting} onClick={onRemove} className={`${SECONDARY_BUTTON_CLASS} text-red-600`}>
        Remove
      </button>
    </li>
  );
}
