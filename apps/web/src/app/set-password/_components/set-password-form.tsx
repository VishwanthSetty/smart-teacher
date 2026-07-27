'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { PasswordInput } from '@/components/ui/password-input';

interface SetPasswordFormProps {
  token: string;
}

export function SetPasswordForm({ token }: SetPasswordFormProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isExpired, setIsExpired] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

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
      <div className="space-y-1">
        <label htmlFor="password" className="block text-sm font-medium text-gray-700">
          Password
        </label>
        <PasswordInput
          id="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
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

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
      >
        {isSubmitting ? 'Setting password…' : 'Set password'}
      </button>
    </form>
  );
}
