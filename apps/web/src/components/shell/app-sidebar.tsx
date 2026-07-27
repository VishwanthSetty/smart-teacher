import type { Role } from '@smart-teacher/shared-types';
import { navItemsForRole } from '@/lib/nav';
import { SidebarNavLink } from './sidebar-nav-link';

export function AppSidebar({ role }: { role: Role }) {
  const items = navItemsForRole(role);

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-gray-200 bg-white md:flex">
      <div className="flex h-16 items-center border-b border-gray-200 px-6">
        <span className="text-sm font-semibold tracking-tight text-gray-900">Smart Teacher</span>
      </div>
      <nav aria-label="Main" className="flex flex-col gap-1 p-3">
        {items.map(({ label, href, icon: Icon }) => (
          <SidebarNavLink key={href} href={href} label={label}>
            <Icon className="h-4 w-4" aria-hidden="true" />
          </SidebarNavLink>
        ))}
      </nav>
    </aside>
  );
}
