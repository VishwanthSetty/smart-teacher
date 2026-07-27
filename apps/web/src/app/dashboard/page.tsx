import Link from 'next/link';
import {
  BookOpen,
  Building2,
  CalendarDays,
  GraduationCap,
  MailWarning,
  Users,
} from 'lucide-react';
import { Role } from '@smart-teacher/shared-types';
import { apiGetDashboardStats, apiListSchools } from '@/lib/api-client';
import { getAccessToken, requireUser } from '@/lib/session';
import { PageHeader } from '@/components/ui/page-header';
import { StatTile } from '@/components/ui/stat-tile';

const TILE_GRID = 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3';

export default async function DashboardPage() {
  const user = await requireUser();
  // The layout's requireUser() already ran, so the cookie is present and getCurrentUser
  // is cached — this is just reading the same request's token back for the API calls.
  const accessToken = getAccessToken() ?? '';

  if (user.role === Role.SCHOOL_ADMIN) {
    const stats = await apiGetDashboardStats(accessToken);

    return (
      <>
        <PageHeader
          title={`Welcome back, ${user.name}`}
          description={user.school?.name ?? undefined}
        />
        <div className={TILE_GRID}>
          <StatTile
            label="Students"
            value={stats.students}
            icon={<GraduationCap className="h-5 w-5" aria-hidden="true" />}
            href="/dashboard/students"
          />
          <StatTile
            label="Teachers"
            value={stats.teachers}
            icon={<Users className="h-5 w-5" aria-hidden="true" />}
            href="/dashboard/teachers"
          />
          <StatTile
            label="Classes"
            value={stats.classes}
            icon={<BookOpen className="h-5 w-5" aria-hidden="true" />}
            hint="Coming soon"
            href="/dashboard/classes"
          />
          <StatTile
            label="Pending invites"
            value={stats.pendingInvites}
            icon={<MailWarning className="h-5 w-5" aria-hidden="true" />}
            hint="Accounts that haven't been activated yet"
          />
          <div className="flex h-full flex-col gap-3 rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-500">Latest timetable</span>
              <span className="text-gray-400">
                <CalendarDays className="h-5 w-5" aria-hidden="true" />
              </span>
            </div>
            {stats.latestTimetable ? (
              <Link
                href={stats.latestTimetable.href}
                className="text-sm font-medium text-gray-900 underline"
              >
                {stats.latestTimetable.name}
              </Link>
            ) : (
              <>
                <span className="text-3xl font-semibold text-gray-900">—</span>
                <span className="text-xs text-gray-400">No timetable published yet</span>
              </>
            )}
          </div>
        </div>
      </>
    );
  }

  if (user.role === Role.SUPER_ADMIN) {
    const schools = await apiListSchools(accessToken, { limit: 1 });

    return (
      <>
        <PageHeader
          title={`Welcome back, ${user.name}`}
          description="Platform administration"
        />
        <div className={TILE_GRID}>
          <StatTile
            label="Schools"
            value={schools.meta.total}
            icon={<Building2 className="h-5 w-5" aria-hidden="true" />}
            href="/dashboard/schools"
          />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title={`Welcome back, ${user.name}`} description={user.school?.name ?? undefined} />
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-gray-600">
          Your timetable and videos will appear here as they are published.
        </p>
      </div>
    </>
  );
}
