import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { canRoleAccess } from '@/lib/nav';
import { getAccessToken, requireUser } from '@/lib/session';
import {
  apiGetSchool,
  apiListActiveSubjects,
  apiListAdminGradeLevels,
  apiListSchoolEntitlements,
  ApiError,
} from '@/lib/api-client';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { GrantEntitlementForm } from './_components/grant-entitlement-form';
import { EntitlementRowActions } from './_components/entitlement-row-actions';

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

  const [entitlements, gradeLevels, subjects] = await Promise.all([
    apiListSchoolEntitlements(accessToken, school.id),
    apiListAdminGradeLevels(accessToken),
    // Active subjects only: the API 409s on granting a retired one, so it must never be offered.
    apiListActiveSubjects(accessToken),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <Link href={ROUTE} className="text-sm text-gray-600 hover:text-gray-900">
        ← All schools
      </Link>

      <PageHeader
        title={school.name}
        description="Grade level and subject content this school can reach."
      />

      <GrantEntitlementForm schoolId={school.id} gradeLevels={gradeLevels} subjects={subjects} />

      {entitlements.length === 0 ? (
        <EmptyState
          icon={<span className="text-3xl">🔒</span>}
          title="No content granted to this school yet"
          description="Teachers and students here see an empty library until you grant a grade level and subject above."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 text-gray-500">
              <tr>
                <th className="px-4 py-3 font-medium">Grade level</th>
                <th className="px-4 py-3 font-medium">Subject</th>
                <th className="px-4 py-3 font-medium">Granted</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {entitlements.map((entitlement) => (
                <tr key={entitlement.id} className="border-b border-gray-100 last:border-0">
                  <td className="px-4 py-3 font-medium">{entitlement.gradeLevelName}</td>
                  <td className="px-4 py-3">{entitlement.subjectName}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {new Date(entitlement.grantedAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <EntitlementRowActions
                      schoolId={school.id}
                      entitlementId={entitlement.id}
                      label={`${entitlement.gradeLevelName} · ${entitlement.subjectName}`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
