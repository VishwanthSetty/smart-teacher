'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { PasswordInput } from '@/components/ui/password-input';

interface ResetPasswordFormProps {
  token: string;
}

export function ResetPasswordForm({ token }: ResetPasswordFormProps) {
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
    const response = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    });
    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({ message: 'Failed to reset password' }));
      if (response.status === 410) {
        setIsExpired(true);
      } else {
        setError(body.message ?? 'Failed to reset password');
      }
      return;
    }

    setIsSuccess(true);
  }

  if (isSuccess) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-gray-700">
          Your password has been changed. All other devices have been signed out.
        </p>
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
          This reset link has expired. Request a new one and use the link from your email.
        </p>
        <Link href="/forgot-password" className="text-sm font-medium text-gray-900 underline">
          Request a new link
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1">
        <label htmlFor="password" className="block text-sm font-medium text-gray-700">
          New password
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
          Confirm new password
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
        {isSubmitting ? 'Resetting…' : 'Reset password'}
      </button>
    </form>
  );
}
