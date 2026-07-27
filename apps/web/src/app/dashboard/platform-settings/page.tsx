import { redirect } from 'next/navigation';
import { SlidersHorizontal } from 'lucide-react';
import { canRoleAccess } from '@/lib/nav';
import { requireUser } from '@/lib/session';
import { ComingSoon } from '@/components/ui/coming-soon';

const ROUTE = '/dashboard/platform-settings';

export default async function PlatformSettingsPage() {
  const user = await requireUser();
  if (!canRoleAccess(user.role, ROUTE)) {
    redirect('/dashboard');
  }

  return (
    <ComingSoon
      title="Platform Settings"
      description="Platform-wide configuration and preferences."
      icon={<SlidersHorizontal className="h-8 w-8" aria-hidden="true" />}
    />
  );
}
