'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { PasswordInput } from '@/components/ui/password-input';

export function LoginForm({ redirectTo }: { redirectTo: string }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [schoolSlug, setSchoolSlug] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, schoolSlug }),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({ message: 'Login failed' }));
      setError(body.message ?? 'Login failed');
      return;
    }

    router.push(redirectTo);
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full space-y-5"
    >
      <div>
        <h1 className="text-2xl font-semibold text-ink">Sign in</h1>
        <p className="mt-1 text-sm text-ink-muted">Use the account your school gave you.</p>
      </div>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-status-danger">{error}</div> : null}

      <div className="space-y-1">
        <label htmlFor="email" className="field-label">
          Email address
        </label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="field"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="password" className="field-label">
          Password
        </label>
        <PasswordInput
          id="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="schoolSlug" className="field-label">
          School slug <span className="font-normal text-ink-muted">(leave blank for platform admin)</span>
        </label>
        <input
          id="schoolSlug"
          type="text"
          value={schoolSlug}
          onChange={(e) => setSchoolSlug(e.target.value)}
          className="field font-mono text-xs"
        />
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="h-11 w-full rounded-lg bg-brand-blue px-3 text-sm font-medium text-white shadow-sm transition hover:bg-brand-navy disabled:opacity-50"
      >
        {isSubmitting ? 'Signing in…' : 'Sign in'}
      </button>

      <Link
        href={schoolSlug ? `/forgot-password?schoolSlug=${encodeURIComponent(schoolSlug)}` : '/forgot-password'}
        className="block text-center text-sm font-medium text-brand-blue hover:text-brand-navy"
      >
        Forgot password?
      </Link>
      <p className="pt-4 text-center text-xs text-ink-muted">Trouble signing in? Contact your school administrator.</p>
    </form>
  );
}
