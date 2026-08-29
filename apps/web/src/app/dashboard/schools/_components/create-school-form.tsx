'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plan } from '@smart-teacher/shared-types';
import { PasswordInput } from '@/components/ui/password-input';
import { Button } from '@/components/ui/button';

export function CreateSchoolForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [academicYear, setAcademicYear] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [plan, setPlan] = useState(Plan.FREE);
  const [sendInvite, setSendInvite] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!adminPassword && !sendInvite) {
      setError('Set an initial password or send an invite email so the admin can sign in');
      return;
    }

    setIsSubmitting(true);
    const response = await fetch('/api/schools', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        slug,
        academicYear,
        adminEmail,
        adminName,
        plan,
        ...(adminPassword ? { adminPassword } : {}),
        sendInvite,
      }),
    });
    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({ message: 'Failed to create school' }));
      setError(body.message ?? 'Failed to create school');
      return;
    }

    setName('');
    setSlug('');
    setAcademicYear('');
    setAdminEmail('');
    setAdminName('');
    setAdminPassword('');
    setPlan(Plan.FREE);
    setSendInvite(true);
    router.refresh();
  }

  return (
    <form
      id="create-school"
      onSubmit={handleSubmit}
      className="space-y-5 rounded-card border border-surface-border bg-white p-6 shadow-card"
    >
      <div>
        <h2 className="text-lg font-medium text-ink">Create a school</h2>
        <p className="mt-1 text-sm text-ink-muted">Provision the tenant and its first school administrator.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <label>
          <span className="field-label">School name</span>
          <input className="field" required value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Oakridge Public School" />
        </label>
        <label>
          <span className="field-label">URL slug <span className="font-normal text-ink-muted">· lowercase, no spaces</span></span>
          <input className="field font-mono text-xs" required value={slug} onChange={(event) => setSlug(event.target.value)} placeholder="oakridge-public" />
        </label>
        <label>
          <span className="field-label">Academic year</span>
          <input className="field" required value={academicYear} onChange={(event) => setAcademicYear(event.target.value)} placeholder="2026-2027" />
        </label>
        <label>
          <span className="field-label">Admin email</span>
          <input className="field" type="email" required value={adminEmail} onChange={(event) => setAdminEmail(event.target.value)} placeholder="admin@school.edu" />
        </label>
        <label>
          <span className="field-label">Admin name</span>
          <input className="field" required value={adminName} onChange={(event) => setAdminName(event.target.value)} placeholder="Full name" />
        </label>
        <label>
          <span className="field-label">Plan</span>
          <select className="field" value={plan} onChange={(event) => setPlan(event.target.value as Plan)}>
            {Object.values(Plan).map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label className="lg:col-span-2">
          <span className="field-label">Initial password <span className="font-normal text-ink-muted">(optional)</span></span>
          <PasswordInput id="adminPassword" value={adminPassword} onChange={(event) => setAdminPassword(event.target.value)} minLength={8} placeholder="Leave blank to let the admin set one via email" />
        </label>
        <label className="flex items-center gap-2 self-end pb-2 text-sm text-ink-muted">
          <input type="checkbox" checked={sendInvite} onChange={(event) => setSendInvite(event.target.checked)} className="rounded border-surface-border text-brand-blue focus:ring-brand-blue" />
          {adminPassword ? 'Email a welcome notice' : 'Send invite email'}
        </label>
      </div>

      {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-status-danger">{error}</p> : null}
      <div className="flex justify-end">
        <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Creating…' : 'Create school'}</Button>
      </div>
    </form>
  );
}
