import type { ReactNode } from 'react';
import { AppHeader } from '@/components/shell/app-header';
import { AppSidebar } from '@/components/shell/app-sidebar';
import { MobileNav } from '@/components/shell/mobile-nav';
import { requireUser } from '@/lib/session';

// Layouts don't re-render when navigating between sibling segments, so the sidebar and
// header paint once and stay put — later navigations swap only the page body and show
// that route's loading.tsx inside the already-rendered shell.
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();

  return (
    <div className="flex min-h-screen">
      <AppSidebar role={user.role} />
      <div className="flex min-h-screen flex-1 flex-col">
        <AppHeader user={user} />
        <MobileNav role={user.role} />
        <main className="flex-1 px-4 py-8 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
