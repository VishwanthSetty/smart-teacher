'use client';

import type { Role } from '@smart-teacher/shared-types';
import { MoreHorizontal, X } from 'lucide-react';
import { useState } from 'react';
import { navItemsForRole } from '@/lib/nav';
import { SidebarNavLink } from './sidebar-nav-link';

// A horizontally scrolling strip stands in for the sidebar below `md`. A drawer would
// need client-side open/close state; this keeps the whole shell server-rendered apart
// from the active-link check.
export function MobileNav({ role }: { role: Role }) {
  const items = navItemsForRole(role);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const primaryItems = items.slice(0, 4);
  const moreItems = items.slice(4);

  return (
    <>
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 grid h-16 grid-cols-5 border-t border-surface-border bg-white px-1 shadow-overlay md:hidden">
        {primaryItems.map(({ label, href, icon: Icon }) => (
          <SidebarNavLink key={href} href={href} label={label} variant="mobile">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </SidebarNavLink>
        ))}
        <button onClick={() => setIsMoreOpen(true)} className="flex flex-col items-center justify-center gap-1 text-[10px] font-medium text-ink-muted">
          <MoreHorizontal className="h-5 w-5" /> More
        </button>
      </nav>
      {isMoreOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button className="absolute inset-0 bg-slate-950/30" onClick={() => setIsMoreOpen(false)} aria-label="Close navigation" />
          <div className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-white p-4 pb-8 shadow-overlay">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-semibold text-ink">More</span>
              <button className="rounded-lg p-2 text-ink-muted" onClick={() => setIsMoreOpen(false)} aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {moreItems.map(({ label, href, icon: Icon }) => (
                <SidebarNavLink key={href} href={href} label={label} variant="mobile">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </SidebarNavLink>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
