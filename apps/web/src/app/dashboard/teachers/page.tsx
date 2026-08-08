import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Role, type User } from '@smart-teacher/shared-types';
import { canRoleAccess } from '@/lib/nav';
import { getAccessToken, requireUser } from '@/lib/session';
import { apiListActiveSubjects, apiListUsers } from '@/lib/api-client';
import { PageHeader } from '@/components/ui/page-header';
import { BulkImportPanel } from './_components/bulk-import-panel';
import { CreateTeacherForm } from './_components/create-teacher-form';
import { TeacherRowActions } from './_components/teacher-row-actions';

const ROUTE = '/dashboard/teachers';

const STATUS_LABELS: Record<User['status'], string> = {
  PENDING: 'Pending',
  ACTIVE: 'Active',
  DISABLED: 'Disabled',
};

export default async function TeachersPage() {
  const user = await requireUser();
  if (!canRoleAccess(user.role, ROUTE)) {
    redirect('/dashboard');
  }
  const isAdmin = user.role === Role.SCHOOL_ADMIN;
  const accessToken = getAccessToken() ?? '';

  // GET /admin/users is already tenant-scoped and SCHOOL_ADMIN-only; filtering by role
  // here avoids adding a query parameter (and an RBAC matrix change) for one caller.
  const [users, subjects] = await Promise.all([
    apiListUsers(accessToken),
    // Only the admin's onboarding form needs the subject list.
    isAdmin ? apiListActiveSubjects(accessToken) : Promise.resolve([]),
  ]);
  const teachers = users.filter((candidate) => candidate.role === Role.TEACHER);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Teachers"
        description="Onboard teaching staff one at a time or in bulk, and assign the subjects they teach."
      />

      {isAdmin && (
        <>
          <BulkImportPanel />
          <CreateTeacherForm subjects={subjects} />
        </>
      )}

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Status</th>
              {isAdmin && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody>
            {teachers.length === 0 ? (
              <tr>
                <td colSpan={isAdmin ? 4 : 3} className="px-4 py-6 text-center text-gray-500">
                  No teachers yet.
                </td>
              </tr>
            ) : (
              teachers.map((teacher) => (
                <tr key={teacher.id} className="border-b border-gray-100 last:border-b-0">
                  <td className="px-4 py-3">
                    <Link href={`/dashboard/teachers/${teacher.id}`} className="font-medium hover:underline">
                      {teacher.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{teacher.email}</td>
                  <td className="px-4 py-3 text-gray-600">{STATUS_LABELS[teacher.status]}</td>
                  {isAdmin && <td className="px-4 py-3"><TeacherRowActions teacher={teacher} /></td>}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
