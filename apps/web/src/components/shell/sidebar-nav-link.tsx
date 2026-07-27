'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';

interface SidebarNavLinkProps {
  href: string;
  label: string;
  children: ReactNode;
}

// The only client component in the shell — it exists solely so the active item can be
// derived from the current pathname.
export function SidebarNavLink({ href, label, children }: SidebarNavLinkProps) {
  const pathname = usePathname();
  // Exact match for the dashboard root, prefix match elsewhere, so a nested route like
  // /dashboard/schools/abc still highlights "Schools" without also lighting up "Dashboard".
  const isActive = href === '/dashboard' ? pathname === href : pathname.startsWith(href);

  return (
    <Link
      href={href}
      aria-current={isActive ? 'page' : undefined}
      className={clsx(
        'flex items-center gap-3 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition',
        isActive ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-100',
      )}
    >
      <span className={clsx(isActive ? 'text-white' : 'text-gray-400')}>{children}</span>
      {label}
    </Link>
  );
}
