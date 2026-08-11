'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { GradeLevel, Subject } from '@smart-teacher/shared-types';

export function CreateTeacherForm({ subjects, gradeLevels }: { subjects: Subject[]; gradeLevels: GradeLevel[] }) {
  const router = useRouter();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [sendCredentialsEmail, setSendCredentialsEmail] = useState(false);
  const [createdPassword, setCreatedPassword] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<Array<{ subjectId: string; gradeLevelId?: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function toggleSubject(subjectId: string) {
    setAssignments((current) =>
      current.some((assignment) => assignment.subjectId === subjectId)
        ? current.filter((assignment) => assignment.subjectId !== subjectId)
        : [...current, { subjectId }],
    );
  }

  function setGrade(subjectId: string, gradeLevelId: string) {
    setAssignments((current) => current.map((assignment) =>
      assignment.subjectId === subjectId
        ? { subjectId, ...(gradeLevelId ? { gradeLevelId } : {}) }
        : assignment,
    ));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setCreatedPassword(null);
    setIsSubmitting(true);

    const response = await fetch('/api/teachers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName,
        lastName,
        email,
        password: password || undefined,
        sendCredentialsEmail,
        assignments: assignments.length > 0 ? assignments : undefined,
      }),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({ message: 'Failed to onboard the teacher' }));
      setError(body.message ?? 'Failed to onboard the teacher');
      return;
    }

    const teacher = await response.json();
    setCreatedPassword(teacher.password);
    setFirstName('');
    setLastName('');
    setEmail('');
    setPassword('');
    setSendCredentialsEmail(false);
    setAssignments([]);
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="h-full space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
    >
      <h2 className="text-lg font-medium">Onboard a teacher</h2>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="teacherFirstName" className="block text-sm font-medium text-gray-700">
            First name
          </label>
          <input
            id="teacherFirstName"
            type="text"
            required
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="teacherLastName" className="block text-sm font-medium text-gray-700">
            Last name
          </label>
          <input
            id="teacherLastName"
            type="text"
            required
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
          />
        </div>

        <div className="space-y-1 sm:col-span-2">
          <label htmlFor="teacherEmail" className="block text-sm font-medium text-gray-700">
            Email
          </label>
          <input
            id="teacherEmail"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
          />
        </div>

        <div className="space-y-1 sm:col-span-2">
          <label htmlFor="teacherPassword" className="block text-sm font-medium text-gray-700">
            Password (leave blank to generate one)
          </label>
          <input
            id="teacherPassword"
            type="text"
            minLength={8}
            maxLength={72}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-700 sm:col-span-2">
          <input
            type="checkbox"
            checked={sendCredentialsEmail}
            onChange={(e) => setSendCredentialsEmail(e.target.checked)}
            className="rounded border-gray-300"
          />
          Email credentials
        </label>

        <div className="space-y-1 sm:col-span-2">
          <span className="block text-sm font-medium text-gray-700">Subjects taught (optional)</span>
          {subjects.length === 0 ? (
            <p className="text-sm text-gray-500">No subjects available yet.</p>
          ) : (
            <div className="grid gap-2">
              {subjects.map((subject) => (
                <div key={subject.id} className="flex items-center gap-3 text-sm text-gray-700">
                  <label className="flex flex-1 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={assignments.some((assignment) => assignment.subjectId === subject.id)}
                    onChange={() => toggleSubject(subject.id)}
                    className="rounded border-gray-300"
                  />
                  {subject.name}
                  </label>
                  <select
                    aria-label={`Grade level for ${subject.name}`}
                    disabled={!assignments.some((assignment) => assignment.subjectId === subject.id)}
                    value={assignments.find((assignment) => assignment.subjectId === subject.id)?.gradeLevelId ?? ''}
                    onChange={(event) => setGrade(subject.id, event.target.value)}
                    className="rounded-md border border-gray-300 px-2 py-1 disabled:opacity-50"
                  >
                    <option value="">Grade not specified</option>
                    {gradeLevels.map((grade) => <option key={grade.id} value={grade.id}>{grade.name}</option>)}
                  </select>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {createdPassword && (
        <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-900">
          <p>Teacher created. Password: <strong>{createdPassword}</strong></p>
          <button type="button" onClick={() => void navigator.clipboard.writeText(createdPassword)} className="mt-2 underline">
            Copy password
          </button>
        </div>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
      >
        {isSubmitting ? 'Onboarding…' : 'Onboard teacher'}
      </button>
    </form>
  );
}
