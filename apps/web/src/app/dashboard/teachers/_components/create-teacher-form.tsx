'use client';

import { FormEvent, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { GradeLevel, Subject } from '@smart-teacher/shared-types';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { InlineFieldError } from '@/components/ui/feedback';

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

  function toggleSubject(subjectId: string): void {
    setAssignments((current) => current.some((item) => item.subjectId === subjectId) ? current.filter((item) => item.subjectId !== subjectId) : [...current, { subjectId }]);
  }

  function setGrade(subjectId: string, gradeLevelId: string): void {
    setAssignments((current) => current.map((item) => item.subjectId === subjectId ? { subjectId, ...(gradeLevelId ? { gradeLevelId } : {}) } : item));
  }

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setCreatedPassword(null);
    setIsSubmitting(true);
    const response = await fetch('/api/teachers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firstName, lastName, email, password: password || undefined, sendCredentialsEmail, assignments: assignments.length > 0 ? assignments : undefined }) });
    setIsSubmitting(false);
    if (!response.ok) {
      const body = await response.json().catch(() => ({ message: 'Failed to onboard the teacher' }));
      setError(body.message ?? 'Failed to onboard the teacher');
      return;
    }
    const teacher = await response.json();
    setCreatedPassword(teacher.password);
    setFirstName(''); setLastName(''); setEmail(''); setPassword(''); setSendCredentialsEmail(false); setAssignments([]);
    router.refresh();
  }

  return (
    <Card className="h-full p-6">
      <details open>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
          <div><h2 className="text-lg font-medium text-ink">Add a teacher</h2><p className="mt-1 text-sm text-ink-muted">Create an account and optionally assign subjects now.</p></div>
          <ChevronDown className="h-5 w-5 text-ink-muted" />
        </summary>
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label><span className="field-label">First name</span><input required value={firstName} onChange={(event) => setFirstName(event.target.value)} className="field" /></label>
            <label><span className="field-label">Last name</span><input required value={lastName} onChange={(event) => setLastName(event.target.value)} className="field" /></label>
            <label className="sm:col-span-2"><span className="field-label">Email address</span><input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="field" /></label>
          </div>
          <div>
            <span className="field-label">Subjects</span>
            <div className="rounded-lg border border-surface-border p-3">
              <div className="mb-3 flex min-h-7 flex-wrap gap-1.5">{assignments.length === 0 ? <span className="text-sm text-ink-muted">Select the subjects this teacher teaches</span> : assignments.map((item) => { const subject = subjects.find((candidate) => candidate.id === item.subjectId); return subject ? <button key={item.subjectId} type="button" onClick={() => toggleSubject(item.subjectId)} className="inline-flex items-center gap-1 rounded-full bg-brand-tint px-2.5 py-1 text-xs font-medium text-brand-navy">{subject.name}<X className="h-3 w-3" /></button> : null; })}</div>
              <div className="grid gap-2">{subjects.map((subject) => { const selected = assignments.find((item) => item.subjectId === subject.id); return <div key={subject.id} className="flex flex-wrap items-center gap-3 rounded-md px-2 py-1.5 hover:bg-slate-50"><label className="flex min-w-40 flex-1 items-center gap-2 text-sm text-ink"><input type="checkbox" checked={Boolean(selected)} onChange={() => toggleSubject(subject.id)} className="h-4 w-4 rounded border-surface-border text-brand-blue" />{subject.name}</label><select aria-label={`Grade level for ${subject.name}`} disabled={!selected} value={selected?.gradeLevelId ?? ''} onChange={(event) => setGrade(subject.id, event.target.value)} className="field h-8 w-44 py-0 text-xs disabled:bg-slate-50 disabled:opacity-60"><option value="">All grades</option>{gradeLevels.map((grade) => <option key={grade.id} value={grade.id}>{grade.name}</option>)}</select></div>; })}</div>
            </div>
          </div>
          <details className="rounded-lg bg-slate-50 p-3"><summary className="cursor-pointer text-sm font-medium text-ink">Credential options</summary><div className="mt-3 space-y-3"><label><span className="field-label">Password (leave blank to generate)</span><input value={password} minLength={8} maxLength={72} onChange={(event) => setPassword(event.target.value)} className="field" /></label><label className="flex items-center gap-2 text-sm text-ink-muted"><input type="checkbox" checked={sendCredentialsEmail} onChange={(event) => setSendCredentialsEmail(event.target.checked)} /> Email credentials</label></div></details>
          {error ? <InlineFieldError>{error}</InlineFieldError> : null}
          {createdPassword ? <p role="status" className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">Teacher created. Generated password: <code className="font-mono font-semibold">{createdPassword}</code></p> : null}
          <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Creating…' : 'Create teacher'}</Button>
        </form>
      </details>
    </Card>
  );
}
