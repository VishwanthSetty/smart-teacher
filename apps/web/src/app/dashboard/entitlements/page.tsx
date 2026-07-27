import { redirect } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { canRoleAccess } from '@/lib/nav';
import { requireUser } from '@/lib/session';
import { ComingSoon } from '@/components/ui/coming-soon';

const ROUTE = '/dashboard/entitlements';

export default async function EntitlementsPage() {
  const user = await requireUser();
  if (!canRoleAccess(user.role, ROUTE)) {
    redirect('/dashboard');
  }

  return (
    <ComingSoon
      title="School Entitlements"
      description="Grant schools access to grade level and subject content."
      icon={<ShieldCheck className="h-8 w-8" aria-hidden="true" />}
    />
  );
}
