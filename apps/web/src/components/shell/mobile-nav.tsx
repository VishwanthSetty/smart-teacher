import type { Role } from '@smart-teacher/shared-types';
import { navItemsForRole } from '@/lib/nav';
import { SidebarNavLink } from './sidebar-nav-link';

// A horizontally scrolling strip stands in for the sidebar below `md`. A drawer would
// need client-side open/close state; this keeps the whole shell server-rendered apart
// from the active-link check.
export function MobileNav({ role }: { role: Role }) {
  const items = navItemsForRole(role);

  return (
    <nav
      aria-label="Main"
      className="flex gap-1 overflow-x-auto border-b border-gray-200 bg-white px-4 py-2 md:hidden"
    >
      {items.map(({ label, href, icon: Icon }) => (
        <SidebarNavLink key={href} href={href} label={label}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </SidebarNavLink>
      ))}
    </nav>
  );
}
