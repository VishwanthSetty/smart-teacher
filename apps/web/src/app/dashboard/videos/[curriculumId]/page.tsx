import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ChevronRight, FileText, Play, Video } from 'lucide-react';
import type { ContentTreeNode } from '@smart-teacher/shared-types';
import { ApiError, apiGetCurriculumTree } from '@/lib/api-client';
import { formatDuration } from '@/lib/format';
import { canRoleAccess } from '@/lib/nav';
import { getAccessToken, requireUser } from '@/lib/session';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';

function Branch({ node, curriculumId, audience }: { node: ContentTreeNode; curriculumId: string; audience: string }) {
  if (node.videoCountDeep === 0 && node.documentCountDeep === 0) return null;
  const count = node.videoCountDeep + node.documentCountDeep;
  return <details open={node.depth === 1} className="group overflow-hidden rounded-card border border-surface-border bg-white shadow-card"><summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4"><ChevronRight className="h-4 w-4 text-ink-muted transition group-open:rotate-90" /><span className="flex-1 text-base font-medium text-ink">{node.levelName} · {node.title}</span><span className="text-sm text-ink-muted">{count} items</span></summary><div className="border-t border-surface-border px-5 py-4">{node.description ? <p className="mb-4 text-sm text-ink-muted">{node.description}</p> : null}<div className="grid gap-2">{node.videos.map((video) => <Link key={video.id} href={`/dashboard/videos/${curriculumId}/${video.id}?audience=${audience}`} className="flex items-center gap-4 rounded-lg border border-transparent p-2 transition hover:border-brand-soft hover:bg-brand-tint/30"><span className="relative flex h-[54px] w-24 shrink-0 items-center justify-center overflow-hidden rounded-md bg-gradient-to-br from-brand-navy to-brand-blue text-white"><Play className="h-5 w-5" />{video.durationSecs !== null ? <span className="absolute bottom-1 right-1 rounded bg-slate-950/75 px-1 text-[10px]">{formatDuration(video.durationSecs)}</span> : null}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-ink">{video.title}</span><span className="mt-1 block text-xs text-ink-muted">{node.levelName} · {node.title}</span></span><Play className="h-4 w-4 text-brand-blue" /></Link>)}{node.documents.map((document) => <Link key={document.id} href={`/dashboard/videos/${curriculumId}/documents/${document.id}?audience=${audience}`} className="flex items-center gap-4 rounded-lg border border-transparent p-2 transition hover:border-brand-soft hover:bg-brand-tint/30"><span className="flex h-[54px] w-24 shrink-0 items-center justify-center rounded-md bg-red-50 text-status-danger"><FileText className="h-7 w-7" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-ink">{document.title}</span><span className="mt-1 block text-xs text-ink-muted">PDF document</span></span><FileText className="h-4 w-4 text-status-danger" /></Link>)}{node.children.map((child) => <Branch key={child.id} node={child} curriculumId={curriculumId} audience={audience} />)}</div></div></details>;
}

export default async function CurriculumTreePage({ params }: { params: { curriculumId: string } }) {
  const user = await requireUser(); if (!canRoleAccess(user.role, '/dashboard/videos')) redirect('/dashboard/forbidden');
  const tree = await apiGetCurriculumTree(getAccessToken() ?? '', params.curriculumId).catch((error) => { if (error instanceof ApiError && error.status === 404) return null; throw error; });
  if (!tree) notFound();
  const totals = tree.nodes.reduce((sum, node) => ({ videos: sum.videos + node.videoCountDeep, documents: sum.documents + node.documentCountDeep }), { videos: 0, documents: 0 });
  return <div className="grid gap-6"><Link href={`/dashboard/videos?audience=${tree.audience}`} className="w-fit text-sm font-medium text-ink-muted hover:text-brand-blue">← Library</Link><PageHeader title={tree.subjectName} description={`${tree.gradeLevelName} · ${totals.videos} videos · ${totals.documents} documents`} />{totals.videos === 0 && totals.documents === 0 ? <EmptyState icon={<Video className="h-8 w-8" />} title="No lessons yet" description="Published videos and documents will appear here." /> : <div className="grid gap-4">{tree.nodes.map((node) => <Branch key={node.id} node={node} curriculumId={tree.curriculumId} audience={tree.audience} />)}</div>}</div>;
}
