import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BookOpen } from 'lucide-react';
import { Role, type TeacherAssignment } from '@smart-teacher/shared-types';
import { canRoleAccess } from '@/lib/nav';
import { getAccessToken, requireUser } from '@/lib/session';
import { apiListGradeLevels, apiListSections, apiListTeacherAssignments } from '@/lib/api-client';
import { CreateSectionForm } from '@/components/sections/create-section-form';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';

const ROUTE = '/dashboard/classes';

function AssignmentChips({ assignments }: { assignments: TeacherAssignment[] }) {
  if (assignments.length === 0) return <span className="text-gray-400">—</span>;

  return (
    <div className="flex flex-wrap gap-2">
      {assignments.map((assignment) => (
        <span
          key={assignment.id}
          className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-700"
        >
          {assignment.subjectName} — {assignment.teacherName}
        </span>
      ))}
    </div>
  );
}

export default async function ClassesPage(): Promise<React.ReactElement> {
  const user = await requireUser();
  if (!canRoleAccess(user.role, ROUTE)) {
    redirect('/dashboard');
  }

  const isAdmin = user.role === Role.SCHOOL_ADMIN;
  const accessToken = getAccessToken() ?? '';
  const [sections, assignments, gradeLevels] = await Promise.all([
    apiListSections(accessToken),
    apiListTeacherAssignments(accessToken, {}),
    isAdmin ? apiListGradeLevels(accessToken) : Promise.resolve([]),
  ]);
  const assignmentsBySection = new Map<string, TeacherAssignment[]>();
  for (const assignment of assignments) {
    if (!assignment.sectionId) continue;
    const existing = assignmentsBySection.get(assignment.sectionId) ?? [];
    existing.push(assignment);
    assignmentsBySection.set(assignment.sectionId, existing);
  }
  const schoolWideAssignments = assignments.filter((assignment) => assignment.sectionId === null);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Classes & Sections"
        description="View class sizes and the teachers assigned to each section."
      />

      {isAdmin && <CreateSectionForm gradeLevels={gradeLevels} />}

      {sections.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="h-8 w-8" aria-hidden="true" />}
          title="No classes yet"
          description="Create a section to start placing students and assigning teachers."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3 font-medium">Class</th>
                <th className="px-4 py-3 font-medium">Grade level</th>
                <th className="px-4 py-3 font-medium">Students</th>
                <th className="px-4 py-3 font-medium">Teachers</th>
              </tr>
            </thead>
            <tbody>
              {sections.map((section) => (
                <tr key={section.id} className="border-b border-gray-100 last:border-b-0">
                  <td className="px-4 py-3 font-medium text-gray-900">{section.label}</td>
                  <td className="px-4 py-3 text-gray-600">{section.gradeLevelName}</td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/students?sectionId=${encodeURIComponent(section.id)}`}
                      className="text-gray-700 underline-offset-4 hover:underline"
                    >
                      {section.studentCount}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <AssignmentChips assignments={assignmentsBySection.get(section.id) ?? []} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {schoolWideAssignments.length > 0 && (
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-medium text-gray-900">School-wide teaching assignments</h2>
            <p className="text-sm text-gray-500">Assignments not yet linked to a specific section.</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <AssignmentChips assignments={schoolWideAssignments} />
          </div>
        </section>
      )}
    </div>
  );
}
