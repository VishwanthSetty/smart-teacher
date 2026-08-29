import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { canRoleAccess } from '@/lib/nav';
import { getAccessToken, requireUser } from '@/lib/session';
import {
  apiGetSchool,
  apiListActiveSubjects,
  apiListAdminGradeLevels,
  apiListCurricula,
  apiListSchoolEntitlements,
  ApiError,
} from '@/lib/api-client';
import { PageHeader } from '@/components/ui/page-header';
import { EntitlementMatrix } from './_components/entitlement-matrix';
import { ContentAudience } from '@smart-teacher/shared-types';

const ROUTE = '/dashboard/entitlements';

export default async function SchoolEntitlementsPage({
  params,
  searchParams,
}: {
  params: { schoolId: string };
  searchParams: { audience?: string };
}) {
  const user = await requireUser();
  if (!canRoleAccess(user.role, ROUTE)) {
    redirect('/dashboard');
  }
  const accessToken = getAccessToken() ?? '';
  const audience = searchParams.audience === ContentAudience.TEACHER
    ? ContentAudience.TEACHER
    : ContentAudience.STUDENT;

  const school = await apiGetSchool(accessToken, params.schoolId).catch((error) => {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    throw error;
  });
  if (!school) {
    notFound();
  }

  const [entitlements, gradeLevels, subjects, curricula] = await Promise.all([
    apiListSchoolEntitlements(accessToken, school.id),
    apiListAdminGradeLevels(accessToken),
    // Active subjects only: the API 409s on granting a retired one, so it must never be offered.
    apiListActiveSubjects(accessToken),
    // The grid's cells are curricula. A high limit rather than pagination: the grid shows
    // every grade x subject at once, and that product bounds the curriculum count.
    apiListCurricula(accessToken, { limit: 200, audience }),
  ]);

  // A grant on a since-retired subject stays live (retirement blocks new grants, not held
  // ones) but the grid only offers active subjects, so it can never appear there. Count it
  // here rather than let it silently vanish from the operator's view.
  const activeSubjectIds = new Set(subjects.map((subject) => subject.id));
  const retiredGrantCount = entitlements.filter((entitlement) => !activeSubjectIds.has(entitlement.subjectId)).length;

  return (
    <div className="flex flex-col gap-6">
      <Link href={ROUTE} className="text-sm font-medium text-brand-blue hover:text-brand-navy">
        ← All schools
      </Link>

      <PageHeader
        title={school.name}
        description="Curricula this school can reach. A grant covers the whole tree beneath it."
      />

      <nav className="inline-flex w-fit rounded-full border border-surface-border bg-white p-1 shadow-card">
        <Link href={`?audience=${ContentAudience.STUDENT}`} className={`rounded-full px-4 py-2 text-sm font-medium ${audience === ContentAudience.STUDENT ? 'bg-brand-navy text-white' : 'text-ink-muted hover:bg-brand-tint'}`}>Students</Link>
        <Link href={`?audience=${ContentAudience.TEACHER}`} className={`rounded-full px-4 py-2 text-sm font-medium ${audience === ContentAudience.TEACHER ? 'bg-brand-navy text-white' : 'text-ink-muted hover:bg-brand-tint'}`}>Teachers</Link>
      </nav>

      <EntitlementMatrix
        schoolId={school.id}
        gradeLevels={gradeLevels}
        subjects={subjects}
        curricula={curricula.data}
        granted={entitlements}
        audience={audience}
      />

      {retiredGrantCount > 0 && (
        <p className="text-sm text-ink-muted">
          {retiredGrantCount} grant{retiredGrantCount === 1 ? '' : 's'} on retired subjects are preserved and not
          shown above.
        </p>
      )}
    </div>
  );
}
