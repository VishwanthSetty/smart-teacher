import type { AuthUser } from '@smart-teacher/shared-types';
import { GraduationCap, HelpCircle } from 'lucide-react';
import { navItemsForRole } from '@/lib/nav';
import { SidebarNavLink } from './sidebar-nav-link';
import { LogoutButton } from './logout-button';

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super admin',
  SCHOOL_ADMIN: 'School admin',
  TEACHER: 'Teacher',
  STUDENT: 'Student',
};

function initials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

export function AppSidebar({ user }: { user: AuthUser }) {
  const items = navItemsForRole(user.role);

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[260px] shrink-0 flex-col bg-brand-navy text-white md:flex">
      <div className="flex h-16 items-center gap-3 border-b border-white/10 px-6">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-blue">
          <GraduationCap className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <div className="text-base font-semibold leading-tight">Smart Teacher</div>
          <div className="text-xs text-brand-soft">Admin Console</div>
        </div>
      </div>
      <nav aria-label="Main" className="flex flex-1 flex-col gap-1 overflow-y-auto py-4">
        {items.map(({ label, href, icon: Icon }) => (
          <SidebarNavLink key={href} href={href} label={label}>
            <Icon className="h-4 w-4" aria-hidden="true" />
          </SidebarNavLink>
        ))}
      </nav>
      <div className="border-t border-white/10 px-3 py-3">
        <a href="mailto:support@smartteacher.dev" className="mb-2 flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/70 hover:bg-white/5 hover:text-white">
          <HelpCircle className="h-4 w-4" /> Help Center
        </a>
        <div className="flex items-center gap-3 rounded-lg bg-white/10 p-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-brand-navy">
            {initials(user.name)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{user.name}</div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-brand-soft">
              {ROLE_LABELS[user.role] ?? user.role}
            </div>
          </div>
          <LogoutButton iconOnly />
        </div>
      </div>
    </aside>
  );
}
