import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BookOpen, Presentation, Search } from 'lucide-react';
import { SchoolStatus } from '@smart-teacher/shared-types';
import { canRoleAccess } from '@/lib/nav';
import { apiGetEntitlementOverview } from '@/lib/api-client';
import { getAccessToken, requireUser } from '@/lib/session';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';

const ROUTE = '/dashboard/entitlements';

export default async function EntitlementsPage({
  searchParams,
}: {
  searchParams: { search?: string };
}) {
  const user = await requireUser();
  if (!canRoleAccess(user.role, ROUTE)) redirect('/dashboard');

  const accessToken = getAccessToken() ?? '';
  const overview = await apiGetEntitlementOverview(accessToken);
  const search = searchParams.search?.trim().toLocaleLowerCase() ?? '';
  const schools = overview.schools.filter((school) =>
    `${school.schoolName} ${school.schoolSlug}`.toLocaleLowerCase().includes(search),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader
          title="School Entitlements"
          description="Grant schools access to grade level and subject content."
        />
        <form className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className="field pl-9"
            type="search"
            name="search"
            defaultValue={searchParams.search ?? ''}
            placeholder="Search schools"
          />
        </form>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {schools.map((school) => {
          const percentage = school.totalCurricula === 0
            ? 0
            : Math.round((school.grantedCurricula / school.totalCurricula) * 100);
          const isSuspended = school.schoolStatus === SchoolStatus.SUSPENDED;
          return (
            <Card
              key={school.schoolId}
              className={`flex flex-col p-6 transition hover:border-brand-soft ${isSuspended ? 'opacity-75 hover:opacity-100' : ''}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-base font-medium text-ink">{school.schoolName}</h2>
                  <div className="font-mono text-xs text-ink-muted">{school.schoolSlug}</div>
                </div>
                <StatusBadge status={school.schoolStatus} />
              </div>
              <div className="my-4 h-px bg-surface-border" />
              <div className="flex flex-wrap gap-5 text-sm text-ink-muted">
                {school.grantedCurricula === 0 ? (
                  <span className="flex items-center gap-2"><BookOpen className="h-4 w-4 opacity-50" /> No curricula granted</span>
                ) : (
                  <>
                    <span className="flex items-center gap-2"><BookOpen className="h-4 w-4" /> {school.studentCurricula} student curricula</span>
                    <span className="flex items-center gap-2"><Presentation className="h-4 w-4" /> {school.teacherCurricula} teacher curricula</span>
                  </>
                )}
              </div>
              <div className="mt-5">
                <div className="h-1 overflow-hidden rounded-full bg-surface-border">
                  <div
                    className={`h-full rounded-full ${isSuspended ? 'bg-status-danger' : 'bg-brand-blue'}`}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
                <div className="mt-1 text-xs text-ink-muted">
                  {school.grantedCurricula} of {school.totalCurricula} curricula granted
                </div>
                <Link
                  href={`${ROUTE}/${school.schoolId}`}
                  className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand-blue hover:text-brand-navy"
                >
                  Manage entitlements →
                </Link>
              </div>
            </Card>
          );
        })}
      </div>

      {schools.length === 0 ? (
        <Card className="py-16 text-center text-sm text-ink-muted">
          {search ? 'No schools match this search.' : 'No schools yet.'}
        </Card>
      ) : null}
    </div>
  );
}
