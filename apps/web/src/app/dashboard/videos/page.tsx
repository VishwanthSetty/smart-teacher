import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BookOpen } from 'lucide-react';
import { ContentAudience, Role, type Curriculum } from '@smart-teacher/shared-types';
import { apiListMyCurricula } from '@/lib/api-client';
import { canRoleAccess } from '@/lib/nav';
import { getAccessToken, requireUser } from '@/lib/session';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';

const ROUTE = '/dashboard/videos';

interface GradeLevelGroup {
  id: string;
  name: string;
  curricula: Curriculum[];
}

function groupByGradeLevel(curricula: Curriculum[]): GradeLevelGroup[] {
  const groups = new Map<string, GradeLevelGroup>();
  for (const curriculum of curricula) {
    const group = groups.get(curriculum.gradeLevelId) ?? {
      id: curriculum.gradeLevelId,
      name: curriculum.gradeLevelName,
      curricula: [],
    };
    group.curricula.push(curriculum);
    groups.set(curriculum.gradeLevelId, group);
  }
  return [...groups.values()];
}

export default async function VideosPage({
  searchParams,
}: {
  searchParams: { gradeLevelId?: string; audience?: string };
}) {
  const user = await requireUser();
  if (!canRoleAccess(user.role, ROUTE)) redirect('/dashboard');

  const isStudent = user.role === Role.STUDENT;
  const audience = !isStudent && searchParams.audience === ContentAudience.TEACHER
    ? ContentAudience.TEACHER
    : ContentAudience.STUDENT;
  const curricula = await apiListMyCurricula(getAccessToken() ?? '', audience);
  const isSchoolAdmin = user.role === Role.SCHOOL_ADMIN;
  const gradeLevelName = curricula[0]?.gradeLevelName;
  const gradeLevels = groupByGradeLevel(curricula);
  const selectedGradeLevel = isSchoolAdmin
    ? gradeLevels.find((gradeLevel) => gradeLevel.id === searchParams.gradeLevelId)
    : undefined;
  const visibleCurricula = selectedGradeLevel?.curricula ?? curricula;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={isStudent ? 'My Subjects' : selectedGradeLevel?.name ?? 'Library'}
        description={
          isStudent
            ? [gradeLevelName, user.school?.name].filter(Boolean).join(' · ')
            : selectedGradeLevel
              ? 'Choose a subject to browse its lessons.'
              : isSchoolAdmin
                ? 'Choose a grade level to view its licensed subjects.'
                : 'Every lesson your school is licensed for.'
        }
        action={
          selectedGradeLevel ? (
            <Link
              href={`${ROUTE}?audience=${audience}`}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
            >
              Back to grade levels
            </Link>
          ) : undefined
        }
      />
      {/* Presentation only: ActorContentScopeService is what prevents student access. */}
      {!isStudent && (
        <nav className="inline-flex w-fit rounded-lg border border-gray-200 bg-white p-1" aria-label="Content audience">
          <Link
            href={`${ROUTE}?audience=${ContentAudience.STUDENT}`}
            className={`rounded-md px-3 py-1.5 text-sm ${audience === ContentAudience.STUDENT ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            For My Students
          </Link>
          <Link
            href={`${ROUTE}?audience=${ContentAudience.TEACHER}`}
            className={`rounded-md px-3 py-1.5 text-sm ${audience === ContentAudience.TEACHER ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            For Me
          </Link>
        </nav>
      )}
      {curricula.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="h-8 w-8" aria-hidden="true" />}
          title="No curricula yet"
          description={audience === ContentAudience.TEACHER
            ? 'No teacher material is licensed for your school yet.'
            : 'No published curriculum is available to you. Ask your school administrator once your class is set up.'}
        />
      ) : isSchoolAdmin && !selectedGradeLevel ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {gradeLevels.map((gradeLevel) => {
            const videoCount = gradeLevel.curricula.reduce(
              (total, curriculum) => total + curriculum.videoCount,
              0,
            );
            const documentCount = gradeLevel.curricula.reduce(
              (total, curriculum) => total + curriculum.documentCount,
              0,
            );
            return (
              <Link
                key={gradeLevel.id}
                href={`${ROUTE}?audience=${audience}&gradeLevelId=${encodeURIComponent(gradeLevel.id)}`}
                className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition hover:border-gray-400"
              >
                <h2 className="font-medium text-gray-900">{gradeLevel.name}</h2>
                <p className="text-sm text-gray-500">
                  {gradeLevel.curricula.length}{' '}
                  {gradeLevel.curricula.length === 1 ? 'subject' : 'subjects'}
                </p>
                <p className="text-sm text-gray-500">
                  {videoCount} {videoCount === 1 ? 'video' : 'videos'}
                  {documentCount > 0 && ` · ${documentCount} ${documentCount === 1 ? 'document' : 'documents'}`}
                </p>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleCurricula.map((curriculum) => (
            <Link
              key={curriculum.id}
              href={`${ROUTE}/${curriculum.id}?audience=${audience}`}
              className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition hover:border-gray-400"
            >
              <h2 className="font-medium text-gray-900">{curriculum.subjectName}</h2>
              <p className="text-sm text-gray-500">
                {isStudent || selectedGradeLevel
                  ? `${curriculum.nodeCount} ${curriculum.nodeCount === 1 ? 'chapter' : 'chapters'}`
                  : curriculum.gradeLevelName}
              </p>
              <p className="text-sm text-gray-500">
                {curriculum.videoCount} {curriculum.videoCount === 1 ? 'video' : 'videos'}
                {curriculum.documentCount > 0 && ` · ${curriculum.documentCount} ${curriculum.documentCount === 1 ? 'document' : 'documents'}`}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
