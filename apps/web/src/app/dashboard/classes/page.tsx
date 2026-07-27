import { redirect } from 'next/navigation';
import { BookOpen } from 'lucide-react';
import { canRoleAccess } from '@/lib/nav';
import { requireUser } from '@/lib/session';
import { ComingSoon } from '@/components/ui/coming-soon';

const ROUTE = '/dashboard/classes';

export default async function ClassesPage() {
  const user = await requireUser();
  if (!canRoleAccess(user.role, ROUTE)) {
    redirect('/dashboard');
  }

  return (
    <ComingSoon
      title="Classes & Subjects"
      description="Define classes, sections, and the subjects taught in each."
      icon={<BookOpen className="h-8 w-8" aria-hidden="true" />}
    />
  );
}
