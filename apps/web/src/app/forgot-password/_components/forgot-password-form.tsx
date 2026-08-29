'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ForgotPasswordForm({ initialSchoolSlug }: { initialSchoolSlug: string }) {
  const [email, setEmail] = useState('');
  const [schoolSlug, setSchoolSlug] = useState(initialSchoolSlug);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    const response = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, schoolSlug }),
    });
    setIsSubmitting(false);
    if (!response.ok) {
      const body = await response.json().catch(() => ({ message: 'Failed to request password reset' }));
      setError(body.message ?? 'Failed to request password reset');
      return;
    }
    setIsSubmitted(true);
  }

  if (isSubmitted) {
    return (
      <div className="space-y-4 text-center">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand-tint text-brand-blue"><Mail className="h-7 w-7" /></span>
        <h2 className="text-xl font-semibold text-ink">Check your inbox</h2>
        <p className="text-sm leading-6 text-ink-muted">If an account exists for that email, we&apos;ve sent a link to reset the password. The link expires in one hour.</p>
        <Link href="/login" className="inline-block text-sm font-medium text-brand-blue hover:text-brand-navy">Back to sign in</Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <label>
        <span className="field-label">Email address</span>
        <input className="field" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
      </label>
      <label>
        <span className="field-label">School slug <span className="font-normal text-ink-muted">(leave blank for platform admin)</span></span>
        <input className="field font-mono text-xs" value={schoolSlug} onChange={(event) => setSchoolSlug(event.target.value)} />
      </label>
      {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-status-danger">{error}</p> : null}
      <Button type="submit" disabled={isSubmitting} className="h-11 w-full">{isSubmitting ? 'Sending…' : 'Send reset link'}</Button>
      <Link href="/login" className="block text-center text-sm font-medium text-brand-blue hover:text-brand-navy">Back to sign in</Link>
    </form>
  );
}
