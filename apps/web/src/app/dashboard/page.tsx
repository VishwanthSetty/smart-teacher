import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  BookOpen,
  Building2,
  CalendarDays,
  FileText,
  GraduationCap,
  ListTree,
  MailWarning,
  Video,
  Users,
} from 'lucide-react';
import { Role, SchoolStatus } from '@smart-teacher/shared-types';
import { apiGetDashboardStats, apiGetPlatformDashboardStats } from '@/lib/api-client';
import { STUDENT_HOME } from '@/lib/nav';
import { getAccessToken, requireUser } from '@/lib/session';
import { PageHeader } from '@/components/ui/page-header';
import { StatTile } from '@/components/ui/stat-tile';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';

const TILE_GRID = 'grid gap-4 sm:grid-cols-2 xl:grid-cols-4';

export default async function DashboardPage() {
  const user = await requireUser();

  // A student has no stat tiles to see. Redirecting here rather than at login covers every
  // entry point at once — the post-login DEFAULT_REDIRECT, the `/` root redirect, and the
  // redirect('/dashboard') fallback other pages use when a role gate fails.
  if (user.role === Role.STUDENT) {
    redirect(STUDENT_HOME);
  }

  // The layout's requireUser() already ran, so the cookie is present and getCurrentUser
  // is cached — this is just reading the same request's token back for the API calls.
  const accessToken = getAccessToken() ?? '';

  if (user.role === Role.SCHOOL_ADMIN) {
    const stats = await apiGetDashboardStats(accessToken);

    return (
      <div className="space-y-6">
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
      </div>
    );
  }

  if (user.role === Role.SUPER_ADMIN) {
    const stats = await apiGetPlatformDashboardStats(accessToken);
    const pipeline = [
      { label: 'Ready', value: stats.contentPipeline.ready, color: 'bg-status-success' },
      { label: 'Processing', value: stats.contentPipeline.processing, color: 'bg-status-info' },
      { label: 'Queued', value: stats.contentPipeline.queued, color: 'bg-status-warning' },
      { label: 'Failed', value: stats.contentPipeline.failed, color: 'bg-status-danger' },
    ];

    return (
      <div className="space-y-6">
        <PageHeader
          title={`Welcome back, ${user.name}`}
          description="Platform administration"
        />
        <div className={TILE_GRID}>
          <StatTile
            label="Schools"
            value={stats.schools}
            icon={<Building2 className="h-5 w-5" aria-hidden="true" />}
            href="/dashboard/schools"
          />
          <StatTile
            label="Curricula"
            value={stats.curricula}
            icon={<ListTree className="h-5 w-5" aria-hidden="true" />}
            href="/dashboard/curriculum"
          />
          <StatTile
            label="Videos"
            value={stats.videos}
            icon={<Video className="h-5 w-5" aria-hidden="true" />}
            href="/dashboard/content-library?type=videos"
          />
          <StatTile
            label="Documents"
            value={stats.documents}
            icon={<FileText className="h-5 w-5" aria-hidden="true" />}
            href="/dashboard/content-library?type=documents"
          />
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="overflow-hidden lg:col-span-2">
            <div className="flex items-center justify-between border-b border-surface-border px-6 py-4">
              <h2 className="text-lg font-medium text-ink">Recently added schools</h2>
              <Link href="/dashboard/schools" className="text-sm font-medium text-brand-blue hover:text-brand-navy">View all schools →</Link>
            </div>
            <div className="divide-y divide-surface-border">
              {stats.recentSchools.map((school) => (
                <Link key={school.id} href={`/dashboard/entitlements/${school.id}`} className="flex items-center justify-between gap-4 px-6 py-3 transition hover:bg-brand-tint/50">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-ink">{school.name}</div>
                    <div className="truncate font-mono text-xs text-ink-muted">{school.slug}</div>
                  </div>
                  <StatusBadge status={school.status} />
                </Link>
              ))}
              {stats.recentSchools.length === 0 ? (
                <div className="px-6 py-10 text-center text-sm text-ink-muted">No schools yet.</div>
              ) : null}
            </div>
          </Card>
          <Card className="p-6">
            <h2 className="text-lg font-medium text-ink">Content pipeline</h2>
            <div className="mt-4 divide-y divide-surface-border">
              {pipeline.map((item) => (
                <div key={item.label} className="flex items-center justify-between py-3">
                  <span className="flex items-center gap-3 text-sm text-ink-muted">
                    <span className={`h-2.5 w-2.5 rounded-full ${item.color}`} />
                    {item.label}
                  </span>
                  <span className="font-semibold tabular-nums text-ink">{item.value.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <>
      <PageHeader title={`Welcome back, ${user.name}`} description={user.school?.name ?? undefined} />
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-gray-600">
          Your classes and lessons will appear here as they are published.
        </p>
      </div>
    </>
  );
}
