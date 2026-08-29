'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { GradeLevel, Section, Subject } from '@smart-teacher/shared-types';
import { Button } from '@/components/ui/button';
import { InlineFieldError } from '@/components/ui/feedback';

export function CreateAssignmentForm({ teacherId, sections, subjects, gradeLevels }: { teacherId: string; sections: Section[]; subjects: Subject[]; gradeLevels: GradeLevel[] }) {
  const router = useRouter();
  const [sectionId, setSectionId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [gradeLevelId, setGradeLevelId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault(); setError(null); setIsSubmitting(true);
    const response = await fetch('/api/teacher-assignments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ teacherId, subjectId, ...(sectionId ? { sectionId } : {}), ...(gradeLevelId ? { gradeLevelId } : {}) }) });
    setIsSubmitting(false);
    if (!response.ok) { const body = await response.json().catch(() => ({ message: 'Failed to create assignment' })); setError(body.message ?? 'Failed to create assignment'); return; }
    setSectionId(''); setSubjectId(''); setGradeLevelId(''); router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <label><span className="field-label">Section</span><select value={sectionId} onChange={(event) => { const value = event.target.value; setSectionId(value); setGradeLevelId(sections.find((section) => section.id === value)?.gradeLevelId ?? ''); }} className="field"><option value="">School-wide</option>{sections.map((section) => <option key={section.id} value={section.id}>{section.label}</option>)}</select></label>
      {!sectionId ? <label><span className="field-label">Grade level</span><select value={gradeLevelId} onChange={(event) => setGradeLevelId(event.target.value)} className="field"><option value="">All grades</option>{gradeLevels.map((grade) => <option key={grade.id} value={grade.id}>{grade.name}</option>)}</select></label> : null}
      <label><span className="field-label">Subject</span><select required value={subjectId} onChange={(event) => setSubjectId(event.target.value)} className="field"><option value="" disabled>Select a subject</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label>
      {error ? <InlineFieldError>{error}</InlineFieldError> : null}
      <Button type="submit" disabled={isSubmitting} className="w-full">{isSubmitting ? 'Assigning…' : 'Assign'}</Button>
      <p className="text-xs leading-5 text-ink-muted">A teacher sees library content for every grade and subject they are assigned to.</p>
    </form>
  );
}
