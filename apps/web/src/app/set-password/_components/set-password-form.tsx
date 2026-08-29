'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { PasswordInput } from '@/components/ui/password-input';
import type { InvitePreview } from '@smart-teacher/shared-types';

interface SetPasswordFormProps {
  token: string;
  preview: InvitePreview;
}

export function SetPasswordForm({ token, preview }: SetPasswordFormProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isExpired, setIsExpired] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const strength = [password.length >= 8, /[a-z]/i.test(password), /\d/.test(password), /[^a-z0-9]/i.test(password)].filter(Boolean).length;
  const strengthLabels = ['Weak', 'Weak', 'Fair', 'Good', 'Strong'];
  const strengthColors = ['bg-surface-border', 'bg-status-danger', 'bg-status-warning', 'bg-brand-soft', 'bg-status-success'];

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsExpired(false);

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    const response = await fetch('/api/auth/set-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    });
    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({ message: 'Failed to set password' }));
      if (response.status === 410) {
        setIsExpired(true);
      } else {
        setError(body.message ?? 'Failed to set password');
      }
      return;
    }

    setIsSuccess(true);
  }

  if (isSuccess) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-gray-700">Your password is set.</p>
        <Link href="/login" className="text-sm font-medium text-gray-900 underline">
          Continue to sign in
        </Link>
      </div>
    );
  }

  if (isExpired) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-red-600">
          This invite link has expired. Ask your school administrator to resend your invite, then
          use the new link from your email.
        </p>
        <Link href="/login" className="text-sm font-medium text-gray-900 underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="inline-flex max-w-full rounded-full bg-brand-tint px-3 py-1 font-mono text-xs text-brand-navy">{preview.email}</div>
      <div className="space-y-1">
        <label htmlFor="password" className="field-label">
          Create password
        </label>
        <PasswordInput
          id="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <div>
        <div className="grid grid-cols-4 gap-1">
          {[1, 2, 3, 4].map((segment) => (
            <span key={segment} className={`h-1 rounded-full ${segment <= strength ? strengthColors[strength] : 'bg-surface-border'}`} />
          ))}
        </div>
        <div className="mt-1 text-right text-xs text-ink-muted">{strengthLabels[strength]}</div>
      </div>

      <div className="space-y-1">
        <label htmlFor="confirmPassword" className="field-label">
          Confirm password
        </label>
        <PasswordInput
          id="confirmPassword"
          required
          minLength={8}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-status-danger">{error}</p>}

      <button
        type="submit"
        disabled={isSubmitting}
        className="h-11 w-full rounded-lg bg-brand-blue px-3 text-sm font-medium text-white hover:bg-brand-navy disabled:opacity-50"
      >
        {isSubmitting ? 'Activating…' : 'Activate account'}
      </button>
      <p className="text-center text-xs text-ink-muted">Your school administrator can never see your password.</p>
    </form>
  );
}
