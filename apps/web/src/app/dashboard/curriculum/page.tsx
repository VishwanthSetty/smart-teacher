import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ListTree } from 'lucide-react';
import { CurriculumStatus } from '@smart-teacher/shared-types';
import {
  apiListActiveSubjects,
  apiListAdminGradeLevels,
  apiListCurricula,
  apiListCurriculumSchemas,
} from '@/lib/api-client';
import { canRoleAccess } from '@/lib/nav';
import { getAccessToken, requireUser } from '@/lib/session';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { CreateCurriculumForm } from './_components/create-curriculum-form';

const ROUTE = '/dashboard/curriculum';

const STATUS_CLASS: Record<CurriculumStatus, string> = {
  PUBLISHED: 'text-green-700',
  DRAFT: 'text-amber-700',
  ARCHIVED: 'text-gray-500',
};

export default async function CurriculumPage() {
  const user = await requireUser();
  if (!canRoleAccess(user.role, ROUTE)) redirect('/dashboard');
  const accessToken = getAccessToken() ?? '';

  const [curricula, gradeLevels, subjects, schemas] = await Promise.all([
    // A high limit rather than pagination: a curriculum is one (grade, subject) pair, so
    // the whole catalogue fits on one screen for any realistic platform.
    apiListCurricula(accessToken, { limit: 200 }),
    apiListAdminGradeLevels(accessToken),
    // Active subjects only: the API 409s on a curriculum naming a retired one.
    apiListActiveSubjects(accessToken),
    apiListCurriculumSchemas(accessToken),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Curriculum"
        description="One curriculum per grade level, subject, and audience. Its tree is what schools browse, and what an entitlement grants."
      />

      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600">
          Level names and depth come from a schema, so the structure can differ from grade to grade
          and subject to subject.
        </p>
        <Link href={`${ROUTE}/schemas`} className="text-sm font-medium text-gray-700 hover:underline">
          Manage level schemas →
        </Link>
      </div>

      <CreateCurriculumForm gradeLevels={gradeLevels} subjects={subjects} schemas={schemas} />

      {curricula.data.length === 0 ? (
        <EmptyState
          icon={<ListTree className="h-8 w-8" aria-hidden="true" />}
          title="No curricula yet"
          description="Create one above. Until a curriculum exists for a grade level and subject, no school can be granted it and no video can be filed under it."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b text-gray-500">
              <tr>
                <th className="px-4 py-3">Grade level</th>
                <th className="px-4 py-3">Subject</th>
                <th className="px-4 py-3">Audience</th>
                <th className="px-4 py-3">Structure</th>
                <th className="px-4 py-3">Nodes</th>
                <th className="px-4 py-3">Videos</th>
                <th className="px-4 py-3">Documents</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {curricula.data.map((curriculum) => (
                <tr key={curriculum.id} className="border-b last:border-0">
                  <td className="px-4 py-3">
                    <Link className="font-medium hover:underline" href={`${ROUTE}/${curriculum.id}`}>
                      {curriculum.gradeLevelName}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{curriculum.subjectName}</td>
                  <td className="px-4 py-3">{curriculum.audience === 'TEACHER' ? 'Teachers' : 'Students'}</td>
                  <td className="px-4 py-3 text-gray-600">{curriculum.schemaName}</td>
                  <td className="px-4 py-3">{curriculum.nodeCount}</td>
                  <td className="px-4 py-3">{curriculum.videoCount}</td>
                  <td className="px-4 py-3">{curriculum.documentCount}</td>
                  <td className={`px-4 py-3 ${STATUS_CLASS[curriculum.status]}`}>{curriculum.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
