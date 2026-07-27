import { redirect } from 'next/navigation';
import { Layers } from 'lucide-react';
import { SubjectStatus } from '@smart-teacher/shared-types';
import { apiListSubjects } from '@/lib/api-client';
import { canRoleAccess } from '@/lib/nav';
import { getAccessToken, requireUser } from '@/lib/session';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { CreateSubjectForm } from './_components/create-subject-form';
import { SubjectRowActions } from './_components/subject-row-actions';

const ROUTE = '/dashboard/taxonomy';

export default async function TaxonomyPage() {
  const user = await requireUser();
  // Real authorization is enforced by the API; this keeps a non-super-admin off a page
  // whose data calls would 403. canRoleAccess reads the same nav table the sidebar does,
  // so the gate cannot drift from the link.
  if (!canRoleAccess(user.role, ROUTE)) {
    redirect('/dashboard');
  }

  // The admin list, so retired subjects appear here and can be reactivated. The
  // canonical GET /subjects that schools read excludes them.
  const subjects = await apiListSubjects(getAccessToken() ?? '');

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Grade Levels & Subjects"
        description="Define the grade levels and subjects that content and entitlements are organised by."
      />

      <CreateSubjectForm />

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 text-gray-500">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Code</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {subjects.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-gray-500">
                  No subjects yet.
                </td>
              </tr>
            )}
            {subjects.map((subject) => (
              <tr key={subject.id} className="border-b border-gray-100 last:border-0">
                <td className="px-4 py-3 font-medium">{subject.name}</td>
                <td className="px-4 py-3 font-mono text-xs text-gray-600">{subject.code}</td>
                <td className="px-4 py-3">
                  <span
                    className={
                      subject.status === SubjectStatus.ACTIVE ? 'text-green-700' : 'text-red-700'
                    }
                  >
                    {subject.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <SubjectRowActions id={subject.id} status={subject.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Grade levels</h2>
        {/* EmptyState rather than ComingSoon: ComingSoon renders its own PageHeader,
            which would put a second <h1> on this page. */}
        <EmptyState
          icon={<Layers className="h-8 w-8" aria-hidden="true" />}
          title="Coming soon"
          description="Grade levels are managed through the API for now. Editing them here lands in a later pass."
        />
      </section>
    </div>
  );
}
