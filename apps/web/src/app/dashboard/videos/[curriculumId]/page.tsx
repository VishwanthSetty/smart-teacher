import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { FileText } from 'lucide-react';
import type { ContentTreeNode } from '@smart-teacher/shared-types';
import { ApiError, apiGetCurriculumTree } from '@/lib/api-client';
import { formatDuration } from '@/lib/format';
import { canRoleAccess } from '@/lib/nav';
import { getAccessToken, requireUser } from '@/lib/session';
import { PageHeader } from '@/components/ui/page-header';

function Branch({
  node,
  curriculumId,
  audience,
}: {
  node: ContentTreeNode;
  curriculumId: string;
  audience: string;
}) {
  if (node.videoCountDeep === 0 && node.documentCountDeep === 0) return null;
  const counts = [
    node.videoCountDeep > 0 ? `${node.videoCountDeep} ${node.videoCountDeep === 1 ? 'video' : 'videos'}` : null,
    node.documentCountDeep > 0 ? `${node.documentCountDeep} ${node.documentCountDeep === 1 ? 'document' : 'documents'}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <details open={node.depth === 1} className="rounded-lg border bg-white p-4 shadow-sm">
      <summary className="cursor-pointer">
        <span className="font-medium">{node.title}</span>
        <span className="ml-2 text-xs text-gray-500">{node.levelName} · {counts}</span>
      </summary>
      {node.description && <p className="mt-2 text-sm text-gray-600">{node.description}</p>}
      <div className="mt-3 grid gap-2">
        {node.videos.map((video) => (
          <Link key={video.id} href={`/dashboard/videos/${curriculumId}/${video.id}?audience=${audience}`} className="rounded border px-3 py-2 text-sm hover:border-gray-400">
            <span className="font-medium">{video.title}</span>
            {video.durationSecs !== null && <span className="ml-2 text-gray-500">{formatDuration(video.durationSecs)}</span>}
          </Link>
        ))}
        {node.documents.map((document) => (
          <Link key={document.id} href={`/dashboard/videos/${curriculumId}/documents/${document.id}?audience=${audience}`} className="flex items-center gap-2 rounded border px-3 py-2 text-sm hover:border-gray-400">
            <FileText className="h-4 w-4" aria-hidden="true" />
            <span className="font-medium">{document.title}</span>
          </Link>
        ))}
        {node.children.map((child) => <Branch key={child.id} node={child} curriculumId={curriculumId} audience={audience} />)}
      </div>
    </details>
  );
}

export default async function CurriculumTreePage({ params }: { params: { curriculumId: string } }) {
  const user = await requireUser();
  if (!canRoleAccess(user.role, '/dashboard/videos')) redirect('/dashboard');
  const tree = await apiGetCurriculumTree(getAccessToken() ?? '', params.curriculumId).catch((error) => {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  });
  if (!tree) notFound();
  const totals = tree.nodes.reduce(
    (sum, node) => ({ videos: sum.videos + node.videoCountDeep, documents: sum.documents + node.documentCountDeep }),
    { videos: 0, documents: 0 },
  );
  const description = [
    tree.gradeLevelName,
    totals.videos > 0 ? `${totals.videos} ${totals.videos === 1 ? 'video' : 'videos'}` : null,
    totals.documents > 0 ? `${totals.documents} ${totals.documents === 1 ? 'document' : 'documents'}` : null,
  ].filter(Boolean).join(' · ');
  return (
    <div className="grid gap-6">
      <Link href={`/dashboard/videos?audience=${tree.audience}`} className="text-sm text-gray-600 hover:text-gray-900">← Library</Link>
      <PageHeader title={tree.subjectName} description={description} />
      <div className="grid gap-4">
        {tree.nodes.map((node) => <Branch key={node.id} node={node} curriculumId={tree.curriculumId} audience={tree.audience} />)}
        {totals.videos === 0 && totals.documents === 0 && <p className="rounded border border-dashed p-8 text-center text-sm text-gray-500">No ready content has been added yet.</p>}
      </div>
    </div>
  );
}
