'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, Check } from 'lucide-react';
import { PasswordInput } from '@/components/ui/password-input';
import { Button, ButtonLink } from '@/components/ui/button';

export function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isExpired, setIsExpired] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const requirements = [
    { label: 'At least 8 characters', met: password.length >= 8 },
    { label: 'One number', met: /\d/.test(password) },
    { label: 'One letter', met: /[a-z]/i.test(password) },
  ];

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsExpired(false);
    if (!requirements.every((item) => item.met)) {
      setError('Your password does not meet all requirements.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setIsSubmitting(true);
    const response = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    });
    setIsSubmitting(false);
    if (!response.ok) {
      const body = await response.json().catch(() => ({ message: 'Failed to reset password' }));
      if (response.status === 410) setIsExpired(true);
      else setError(body.message ?? 'Failed to reset password');
      return;
    }
    setIsSuccess(true);
  }

  if (isSuccess) {
    return (
      <div className="space-y-4 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-50 text-status-success"><Check className="h-6 w-6" /></span>
        <p className="text-sm text-ink-muted">Your password has been changed. All other devices have been signed out.</p>
        <Link href="/login" className="text-sm font-medium text-brand-blue">Continue to sign in</Link>
      </div>
    );
  }

  if (isExpired) {
    return (
      <div className="space-y-4 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-status-danger"><AlertCircle className="h-6 w-6" /></span>
        <h2 className="text-xl font-semibold text-ink">This link has expired</h2>
        <p className="text-sm text-ink-muted">Reset links are valid for one hour.</p>
        <ButtonLink href="/forgot-password" className="w-full">Request a new link</ButtonLink>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <label>
        <span className="field-label">New password</span>
        <PasswordInput required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} />
      </label>
      <ul className="grid grid-cols-1 gap-1 text-xs sm:grid-cols-3">
        {requirements.map((item) => (
          <li key={item.label} className={`flex items-center gap-1 ${item.met ? 'text-status-success' : 'text-ink-muted'}`}>
            <Check className="h-3.5 w-3.5" /> {item.label}
          </li>
        ))}
      </ul>
      <label>
        <span className="field-label">Confirm password</span>
        <PasswordInput required minLength={8} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
      </label>
      {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-status-danger">{error}</p> : null}
      <Button type="submit" disabled={isSubmitting} className="h-11 w-full">{isSubmitting ? 'Resetting…' : 'Reset password'}</Button>
    </form>
  );
}
