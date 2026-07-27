import { redirect } from 'next/navigation';
import { GraduationCap } from 'lucide-react';
import { canRoleAccess } from '@/lib/nav';
import { requireUser } from '@/lib/session';
import { ComingSoon } from '@/components/ui/coming-soon';

const ROUTE = '/dashboard/students';

export default async function StudentsPage() {
  const user = await requireUser();
  // The API is the real boundary; this only stops a user landing on a page whose data
  // calls would 403 (mirrors the guard in dashboard/schools/page.tsx).
  if (!canRoleAccess(user.role, ROUTE)) {
    redirect('/dashboard');
  }

  return (
    <ComingSoon
      title="Students"
      description="Enrol students, manage their profiles, and track pending invitations."
      icon={<GraduationCap className="h-8 w-8" aria-hidden="true" />}
    />
  );
}
