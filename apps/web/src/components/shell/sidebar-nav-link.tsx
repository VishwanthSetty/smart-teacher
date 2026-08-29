'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';

interface SidebarNavLinkProps {
  href: string;
  label: string;
  children: ReactNode;
  variant?: 'sidebar' | 'mobile';
}

// The only client component in the shell — it exists solely so the active item can be
// derived from the current pathname.
export function SidebarNavLink({ href, label, children, variant = 'sidebar' }: SidebarNavLinkProps) {
  const pathname = usePathname();
  // Exact match for the dashboard root, prefix match elsewhere, so a nested route like
  // /dashboard/schools/abc still highlights "Schools" without also lighting up "Dashboard".
  const isActive = href === '/dashboard' ? pathname === href : pathname.startsWith(href);

  return (
    <Link
      href={href}
      aria-current={isActive ? 'page' : undefined}
      className={clsx(
        variant === 'mobile'
          ? 'flex min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[10px] font-medium transition'
          : 'flex h-10 items-center gap-3 whitespace-nowrap border-l-[3px] px-5 text-sm font-medium transition',
        variant === 'mobile'
          ? isActive ? 'bg-brand-tint text-brand-navy' : 'text-ink-muted hover:bg-brand-tint'
          : isActive
            ? 'border-brand-soft bg-white/10 text-white'
            : 'border-transparent text-white/75 hover:bg-white/5 hover:text-white',
      )}
    >
      <span className={clsx(variant === 'mobile' ? isActive ? 'text-brand-blue' : 'text-ink-muted' : isActive ? 'text-brand-soft' : 'text-white/65')}>{children}</span>
      <span className={variant === 'mobile' ? 'max-w-full truncate' : undefined}>{label}</span>
    </Link>
  );
}
