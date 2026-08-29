import { redirect } from 'next/navigation';
import { CalendarDays } from 'lucide-react';
import { canRoleAccess } from '@/lib/nav';
import { requireUser } from '@/lib/session';
import { ComingSoon } from '@/components/ui/coming-soon';

const ROUTE = '/dashboard/timetable';

export default async function TimetablePage() {
  const user = await requireUser();
  if (!canRoleAccess(user.role, ROUTE)) {
    redirect('/dashboard/forbidden');
  }

  return (
    <ComingSoon
      title="Timetable"
      description="Build and publish the weekly schedule for every class."
      icon={<CalendarDays className="h-8 w-8" aria-hidden="true" />}
    />
  );
}
