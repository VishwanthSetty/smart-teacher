import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { ContentTreeNode } from '@smart-teacher/shared-types';
import { ApiError, apiGetCurriculumTree } from '@/lib/api-client';
import { formatDuration } from '@/lib/format';
import { canRoleAccess } from '@/lib/nav';
import { getAccessToken, requireUser } from '@/lib/session';
import { PageHeader } from '@/components/ui/page-header';

function Branch({ node, curriculumId }: { node: ContentTreeNode; curriculumId: string }) {
  if (node.videoCountDeep === 0) return null;

  return (
    <details open={node.depth === 1} className="rounded-lg border bg-white p-4 shadow-sm">
      <summary className="cursor-pointer">
        <span className="font-medium">{node.title}</span>
        <span className="ml-2 text-xs text-gray-500">
          {node.levelName} · {node.videoCountDeep} videos
        </span>
      </summary>
      {node.description && <p className="mt-2 text-sm text-gray-600">{node.description}</p>}
      <div className="mt-3 grid gap-2">
        {node.videos.map((video) => (
          <Link
            key={video.id}
            href={`/dashboard/videos/${curriculumId}/${video.id}`}
            className="rounded border px-3 py-2 text-sm hover:border-gray-400"
          >
            <span className="font-medium">{video.title}</span>
            {video.durationSecs !== null && (
              <span className="ml-2 text-gray-500">{formatDuration(video.durationSecs)}</span>
            )}
          </Link>
        ))}
        {node.children.map((child) => (
          <Branch key={child.id} node={child} curriculumId={curriculumId} />
        ))}
      </div>
    </details>
  );
}

export default async function CurriculumTreePage({
  params,
}: {
  params: { curriculumId: string };
}) {
  const user = await requireUser();
  if (!canRoleAccess(user.role, '/dashboard/videos')) redirect('/dashboard');

  const tree = await apiGetCurriculumTree(getAccessToken() ?? '', params.curriculumId).catch(
    (error) => {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    },
  );
  if (!tree) notFound();

  const firstLevelName = tree.nodes[0]?.levelName;
  const structureDescription = firstLevelName
    ? `${tree.gradeLevelName} · ${tree.nodes.length} ${firstLevelName}${tree.nodes.length === 1 ? '' : 's'}`
    : tree.gradeLevelName;

  return (
    <div className="grid gap-6">
      <Link href="/dashboard/videos" className="text-sm text-gray-600 hover:text-gray-900">
        ← My Subjects
      </Link>
      <PageHeader title={tree.subjectName} description={structureDescription} />
      <div className="grid gap-4">
        {tree.nodes.map((node) => (
          <Branch key={node.id} node={node} curriculumId={tree.curriculumId} />
        ))}
        {tree.nodes.every((node) => node.videoCountDeep === 0) && (
          <p className="rounded border border-dashed p-8 text-center text-sm text-gray-500">
            No ready videos have been added yet.
          </p>
        )}
      </div>
    </div>
  );
}
