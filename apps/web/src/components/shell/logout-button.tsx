'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';

export function LogoutButton({ iconOnly = false }: { iconOnly?: boolean }) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleLogout() {
    setIsSubmitting(true);
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <button
      onClick={handleLogout}
      disabled={isSubmitting}
      className={
        iconOnly
          ? 'rounded-lg p-2 text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-50'
          : 'rounded-lg border border-surface-border px-3 py-1.5 text-sm font-medium hover:bg-brand-tint disabled:opacity-50'
      }
      aria-label={iconOnly ? 'Sign out' : undefined}
    >
      {iconOnly ? <LogOut className="h-4 w-4" /> : isSubmitting ? 'Signing out…' : 'Sign out'}
    </button>
  );
}
