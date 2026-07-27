import { redirect } from 'next/navigation';
import { Library } from 'lucide-react';
import { canRoleAccess } from '@/lib/nav';
import { requireUser } from '@/lib/session';
import { ComingSoon } from '@/components/ui/coming-soon';

const ROUTE = '/dashboard/content-library';

export default async function ContentLibraryPage() {
  const user = await requireUser();
  if (!canRoleAccess(user.role, ROUTE)) {
    redirect('/dashboard');
  }

  return (
    <ComingSoon
      title="Content Library"
      description="Manage the platform video catalogue that schools are entitled to."
      icon={<Library className="h-8 w-8" aria-hidden="true" />}
    />
  );
}
