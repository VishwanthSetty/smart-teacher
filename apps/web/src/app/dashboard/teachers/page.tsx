import { redirect } from 'next/navigation';
import { Users } from 'lucide-react';
import { canRoleAccess } from '@/lib/nav';
import { requireUser } from '@/lib/session';
import { ComingSoon } from '@/components/ui/coming-soon';

const ROUTE = '/dashboard/teachers';

export default async function TeachersPage() {
  const user = await requireUser();
  if (!canRoleAccess(user.role, ROUTE)) {
    redirect('/dashboard');
  }

  return (
    <ComingSoon
      title="Teachers"
      description="Invite teaching staff, assign subjects, and manage their access."
      icon={<Users className="h-8 w-8" aria-hidden="true" />}
    />
  );
}
