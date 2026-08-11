import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ApiError, apiGetAdminCurriculumTree, apiGetCurriculum } from '@/lib/api-client';
import { canRoleAccess } from '@/lib/nav';
import { getAccessToken, requireUser } from '@/lib/session';
import { PageHeader } from '@/components/ui/page-header';
import { ContentTreeEditor } from './_components/content-tree-editor';
import { PublishControls } from './_components/publish-controls';

export default async function CurriculumBuilderPage({ params }: { params: { id: string } }) {
  const user = await requireUser(); if (!canRoleAccess(user.role, '/dashboard/curriculum')) redirect('/dashboard'); const token = getAccessToken() ?? '';
  const result = await Promise.all([apiGetCurriculum(token, params.id), apiGetAdminCurriculumTree(token, params.id)]).catch((error) => { if (error instanceof ApiError && error.status === 404) return null; throw error; });
  if (!result) notFound(); const [curriculum, tree] = result;
  return <div className="grid gap-6"><Link href="/dashboard/curriculum" className="text-sm text-gray-600 hover:text-gray-900">← Curriculum</Link><div className="flex flex-wrap items-start justify-between gap-4"><PageHeader title={`${curriculum.gradeLevelName} · ${curriculum.subjectName}`} description={`${curriculum.audience === 'TEACHER' ? 'Teachers' : 'Students'} · ${curriculum.schemaName} · ${curriculum.status} · ${curriculum.nodeCount} nodes · ${curriculum.videoCount} videos · ${curriculum.documentCount} documents`} /><PublishControls id={curriculum.id} status={curriculum.status} /></div><div className="rounded-lg bg-blue-50 p-4 text-sm text-blue-900">Structure: {curriculum.levels.map((level) => `${level.name}${level.canHoldContent ? ' (content)' : ''}`).join(' → ')}</div><ContentTreeEditor curriculumId={curriculum.id} levels={curriculum.levels} nodes={tree.nodes} /></div>;
}
