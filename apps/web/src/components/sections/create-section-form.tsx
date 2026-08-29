'use client';

import { FormEvent, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { GradeLevel } from '@smart-teacher/shared-types';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { InlineFieldError } from '@/components/ui/feedback';

export function CreateSectionForm({ gradeLevels }: { gradeLevels: GradeLevel[] }) {
  const router = useRouter();
  const [gradeLevelId, setGradeLevelId] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault(); setError(null); setIsSubmitting(true);
    const response = await fetch('/api/sections', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ gradeLevelId, name }) });
    setIsSubmitting(false);
    if (!response.ok) { const body = await response.json().catch(() => ({ message: 'Failed to create section' })); setError(body.message ?? 'Failed to create section'); return; }
    setGradeLevelId(''); setName(''); router.refresh();
  }
  return <Card id="create-section" className="p-6"><details open><summary className="flex cursor-pointer list-none items-center justify-between"><div><h2 className="text-lg font-medium text-ink">Create a section</h2><p className="mt-1 text-sm text-ink-muted">Add a class section for an existing grade level.</p></div><ChevronDown className="h-5 w-5 text-ink-muted" /></summary><form onSubmit={handleSubmit} className="mt-5 grid items-end gap-4 md:grid-cols-[1fr_1fr_auto]"><label><span className="field-label">Grade level</span><select required value={gradeLevelId} onChange={(event) => setGradeLevelId(event.target.value)} className="field"><option value="" disabled>Select a grade level</option>{gradeLevels.map((grade) => <option key={grade.id} value={grade.id}>{grade.name}</option>)}</select></label><label><span className="field-label">Section label</span><input required value={name} onChange={(event) => setName(event.target.value)} placeholder="A, B, Blue…" className="field" /></label><Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Creating…' : 'Create section'}</Button>{error ? <div className="md:col-span-3"><InlineFieldError>{error}</InlineFieldError></div> : null}</form></details></Card>;
}
