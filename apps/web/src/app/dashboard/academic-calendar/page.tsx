import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Role } from '@smart-teacher/shared-types';
import { apiListAcademicYears } from '@/lib/api-client';
import { canRoleAccess } from '@/lib/nav';
import { getAccessToken, requireUser } from '@/lib/session';
import { PageHeader } from '@/components/ui/page-header';
import { pickYear } from './_components/calendar-dates';
import { CalendarMonthView } from './_components/calendar-month-view';
import { NoAcademicYears } from './_components/no-academic-years';
import { PlatformCalendarAdmin } from './_components/platform-calendar-admin';
import { SchoolCalendarAdmin } from './_components/school-calendar-admin';

const ROUTE = '/dashboard/academic-calendar';

interface SearchParams {
  year?: string;
  month?: string;
  class?: string;
  view?: string;
}

// One route, three surfaces: SUPER_ADMIN authors years and defaults, SCHOOL_ADMIN
// manages the school's plans (and can preview the view with ?view=calendar), and
// TEACHER/STUDENT read the resolved calendar.
export default async function AcademicCalendarPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  if (!canRoleAccess(user.role, ROUTE)) {
    redirect('/dashboard/forbidden');
  }

  const token = getAccessToken() ?? '';
  const years = await apiListAcademicYears(token);
  const year = pickYear(years, searchParams.year);

  if (user.role === Role.SUPER_ADMIN) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Academic Calendar" description="Plan which lesson is taught on which day, for every class and subject." />
        <PlatformCalendarAdmin token={token} years={years} year={year} />
      </div>
    );
  }

  const isManaging = user.role === Role.SCHOOL_ADMIN && searchParams.view !== 'calendar';
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Academic Calendar"
        description={
          isManaging
            ? 'Choose which lesson plan your classes follow, and whether to use one at all.'
            : 'What is planned for each day of the academic year.'
        }
      />
      {year === null ? (
        <NoAcademicYears canCreate={false} />
      ) : isManaging ? (
        <SchoolCalendarAdmin token={token} years={years} year={year} />
      ) : (
        <>
          {user.role === Role.SCHOOL_ADMIN ? (
            <Link href={`${ROUTE}?year=${year.id}`} className="text-sm font-medium text-brand-blue hover:text-brand-navy">
              ← Manage plans
            </Link>
          ) : null}
          <CalendarMonthView token={token} years={years} year={year} params={searchParams} />
        </>
      )}
    </div>
  );
}
