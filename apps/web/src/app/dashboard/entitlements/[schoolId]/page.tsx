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

const ROUTE = '/dashboard/entitlements';

export default async function SchoolEntitlementsPage({
  params,
}: {
  params: { schoolId: string };
}) {
  const user = await requireUser();
  if (!canRoleAccess(user.role, ROUTE)) {
    redirect('/dashboard');
  }
  const accessToken = getAccessToken() ?? '';

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
    apiListCurricula(accessToken, { limit: 200 }),
  ]);

  // A grant on a since-retired subject stays live (retirement blocks new grants, not held
  // ones) but the grid only offers active subjects, so it can never appear there. Count it
  // here rather than let it silently vanish from the operator's view.
  const activeSubjectIds = new Set(subjects.map((subject) => subject.id));
  const retiredGrantCount = entitlements.filter((entitlement) => !activeSubjectIds.has(entitlement.subjectId)).length;

  return (
    <div className="flex flex-col gap-6">
      <Link href={ROUTE} className="text-sm text-gray-600 hover:text-gray-900">
        ← All schools
      </Link>

      <PageHeader
        title={school.name}
        description="Curricula this school can reach. A grant covers the whole tree beneath it."
      />

      <EntitlementMatrix
        schoolId={school.id}
        gradeLevels={gradeLevels}
        subjects={subjects}
        curricula={curricula.data}
        granted={entitlements}
      />

      {retiredGrantCount > 0 && (
        <p className="text-sm text-gray-500">
          {retiredGrantCount} grant{retiredGrantCount === 1 ? '' : 's'} on retired subjects are preserved and not
          shown above.
        </p>
      )}
    </div>
  );
}
