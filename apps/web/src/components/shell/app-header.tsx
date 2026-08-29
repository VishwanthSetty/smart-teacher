import type { AuthUser } from '@smart-teacher/shared-types';
import { Bell, HelpCircle, Search } from 'lucide-react';

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super admin',
  SCHOOL_ADMIN: 'School admin',
  TEACHER: 'Teacher',
  STUDENT: 'Student',
};

export function AppHeader({ user }: { user: AuthUser }) {
  const userInitials = user.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  return (
    <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between gap-4 border-b border-surface-border bg-white px-4 sm:px-6">
      <label className="relative hidden w-full max-w-sm sm:block">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input className="field bg-surface-low pl-9" placeholder="Search…" aria-label="Search" />
      </label>
      <div className="min-w-0 sm:hidden">
        <div className="truncate text-sm font-semibold text-ink">Smart Teacher</div>
        <div className="truncate text-xs text-ink-muted">{user.school?.name ?? 'Platform administration'}</div>
      </div>

      <div className="ml-auto flex items-center gap-1">
        <button className="rounded-full p-2.5 text-ink-muted hover:bg-brand-tint hover:text-brand-navy" aria-label="Notifications">
          <Bell className="h-5 w-5" />
        </button>
        <button className="hidden rounded-full p-2.5 text-ink-muted hover:bg-brand-tint hover:text-brand-navy sm:block" aria-label="Help">
          <HelpCircle className="h-5 w-5" />
        </button>
        <span className="mx-2 hidden h-6 w-px bg-surface-border sm:block" />
        <div className="flex items-center gap-2 rounded-full px-1 py-1 sm:px-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-tint text-xs font-semibold text-brand-navy">{userInitials}</span>
          <div className="hidden min-w-0 text-left lg:block">
            <div className="max-w-32 truncate text-xs font-medium text-ink">{user.name}</div>
            <div className="text-[10px] text-ink-muted">{ROLE_LABELS[user.role] ?? user.role}</div>
          </div>
        </div>
      </div>
    </header>
  );
}
