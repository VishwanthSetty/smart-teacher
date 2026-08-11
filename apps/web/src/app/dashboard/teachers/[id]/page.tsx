import { notFound, redirect } from 'next/navigation';
import { Role } from '@smart-teacher/shared-types';
import { canRoleAccess } from '@/lib/nav';
import { getAccessToken, requireUser } from '@/lib/session';
import {
  apiGetUser,
  apiListActiveSubjects,
  apiListSections,
  apiListTeacherAssignments,
  apiListGradeLevels,
  ApiError,
} from '@/lib/api-client';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { CreateAssignmentForm } from '../_components/create-assignment-form';
import { AssignmentRowActions } from '../_components/assignment-row-actions';

const ROUTE = '/dashboard/teachers';

export default async function TeacherDetailPage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  if (!canRoleAccess(user.role, ROUTE)) {
    redirect('/dashboard');
  }
  const accessToken = getAccessToken() ?? '';

  const teacher = await apiGetUser(accessToken, params.id).catch((error) => {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    throw error;
  });
  if (!teacher || teacher.role !== Role.TEACHER) {
    notFound();
  }

  const [assignments, sections, subjects, gradeLevels] = await Promise.all([
    apiListTeacherAssignments(accessToken, { teacherId: teacher.id }),
    apiListSections(accessToken),
    apiListActiveSubjects(accessToken),
    apiListGradeLevels(accessToken),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={teacher.name} description={teacher.email} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <CreateAssignmentForm teacherId={teacher.id} sections={sections} subjects={subjects} gradeLevels={gradeLevels} />
        </div>

        <div className="lg:col-span-2">
          {assignments.length === 0 ? (
            <EmptyState
              icon={<span className="text-3xl">📚</span>}
              title="No assignments yet"
              description="Assign this teacher to a section and subject using the form."
            />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Section</th>
                    <th className="px-4 py-3 font-medium">Subject</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {assignments.map((assignment) => (
                    <tr key={assignment.id} className="border-b border-gray-100 last:border-b-0">
                      <td className="px-4 py-3 text-gray-600">
                        {assignment.sectionLabel ?? assignment.gradeLevelName ?? (
                          <span className="text-gray-400">Grade not specified</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-medium">{assignment.subjectName}</td>
                      <td className="px-4 py-3 text-right">
                        <AssignmentRowActions assignmentId={assignment.id} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
