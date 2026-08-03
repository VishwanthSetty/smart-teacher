'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Section } from '@smart-teacher/shared-types';

export function CreateStudentForm({ sections }: { sections: Section[] }) {
  const router = useRouter();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [rollNumber, setRollNumber] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const response = await fetch('/api/students', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName,
        lastName,
        email,
        rollNumber: rollNumber || undefined,
        sectionId,
      }),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({ message: 'Failed to onboard the student' }));
      setError(body.message ?? 'Failed to onboard the student');
      return;
    }

    setFirstName('');
    setLastName('');
    setEmail('');
    setRollNumber('');
    setSectionId('');
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="h-full space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
    >
      <h2 className="text-lg font-medium">Onboard a student</h2>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="firstName" className="block text-sm font-medium text-gray-700">
            First name
          </label>
          <input
            id="firstName"
            type="text"
            required
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="lastName" className="block text-sm font-medium text-gray-700">
            Last name
          </label>
          <input
            id="lastName"
            type="text"
            required
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
          />
        </div>

        <div className="space-y-1 sm:col-span-2">
          <label htmlFor="email" className="block text-sm font-medium text-gray-700">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="rollNumber" className="block text-sm font-medium text-gray-700">
            Roll number (optional)
          </label>
          <input
            id="rollNumber"
            type="text"
            value={rollNumber}
            onChange={(e) => setRollNumber(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="sectionId" className="block text-sm font-medium text-gray-700">
            Class / Section
          </label>
          <select
            id="sectionId"
            required
            value={sectionId}
            onChange={(e) => setSectionId(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
          >
            <option value="" disabled>
              Select a section
            </option>
            {sections.map((section) => (
              <option key={section.id} value={section.id}>
                {section.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={isSubmitting || sections.length === 0}
        className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
      >
        {isSubmitting ? 'Onboarding…' : 'Onboard student'}
      </button>
      {sections.length === 0 && (
        <p className="text-sm text-gray-500">Create a section before onboarding a student.</p>
      )}
    </form>
  );
}
