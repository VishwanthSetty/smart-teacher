import { redirect } from 'next/navigation';
import { Settings } from 'lucide-react';
import { canRoleAccess } from '@/lib/nav';
import { requireUser } from '@/lib/session';
import { ComingSoon } from '@/components/ui/coming-soon';

const ROUTE = '/dashboard/settings';

export default async function SettingsPage() {
  const user = await requireUser();
  if (!canRoleAccess(user.role, ROUTE)) {
    redirect('/dashboard/forbidden');
  }

  return (
    <ComingSoon
      title="Settings"
      description="Academic year, branding, and other school-wide preferences."
      icon={<Settings className="h-8 w-8" aria-hidden="true" />}
    />
  );
}
