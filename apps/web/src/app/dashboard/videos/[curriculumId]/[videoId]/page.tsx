import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Play } from 'lucide-react';
import type { ContentTreeNode, ContentTreeVideo } from '@smart-teacher/shared-types';
import { ApiError, apiGetCurriculumTree, apiGetPlaybackToken, apiGetVideo } from '@/lib/api-client';
import { formatDuration } from '@/lib/format';
import { canRoleAccess } from '@/lib/nav';
import { getAccessToken, requireUser } from '@/lib/session';
import { HlsPlayer } from '@/components/video/hls-player';

interface PlaylistItem extends ContentTreeVideo { nodeTitle: string }
function flatten(nodes: ContentTreeNode[]): PlaylistItem[] { return nodes.flatMap((node) => [...node.videos.map((video) => ({ ...video, nodeTitle: node.title })), ...flatten(node.children)]); }

export default async function VideoDetailPage({ params, searchParams }: { params: { curriculumId: string; videoId: string }; searchParams: { audience?: string } }) {
  const user = await requireUser(); if (!canRoleAccess(user.role, '/dashboard/videos')) redirect('/dashboard/forbidden'); const token = getAccessToken() ?? '';
  const [video, tree] = await Promise.all([apiGetVideo(token, params.videoId).catch((error) => { if (error instanceof ApiError && error.status === 404) return null; throw error; }), apiGetCurriculumTree(token, params.curriculumId).catch(() => null)]);
  if (!video || video.curriculumId !== params.curriculumId) notFound();
  const ticket = await apiGetPlaybackToken(token, video.id).catch(() => null);
  const playlist = tree ? flatten(tree.nodes) : [];
  const audience = encodeURIComponent(searchParams.audience ?? tree?.audience ?? '');
  return <div className="grid gap-5"><Link href={`/dashboard/videos/${params.curriculumId}?audience=${audience}`} className="w-fit text-sm font-medium text-ink-muted hover:text-brand-blue">← Curriculum</Link><div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]"><main><HlsPlayer videoId={video.id} title={video.title} posterUrl={ticket?.posterUrl ?? undefined} /><h1 className="mt-5 text-2xl font-semibold text-ink">{video.title}</h1><p className="mt-2 text-sm text-ink-muted">{tree?.subjectName ?? 'Curriculum'} · {video.contentNodeTitle}</p>{video.description ? <p className="mt-4 max-w-3xl whitespace-pre-line text-sm leading-6 text-ink-muted">{video.description}</p> : null}</main>{playlist.length > 0 ? <aside className="sticky top-24 overflow-hidden rounded-card border border-surface-border bg-white shadow-card"><h2 className="border-b border-surface-border px-4 py-3 text-base font-semibold text-ink">Up next</h2><div className="max-h-[70vh] overflow-y-auto">{playlist.map((item) => { const current = item.id === video.id; return <Link key={item.id} href={`/dashboard/videos/${params.curriculumId}/${item.id}?audience=${audience}`} className={`flex gap-3 border-l-4 p-3 ${current ? 'border-brand-blue bg-brand-tint' : 'border-transparent hover:bg-slate-50'}`}><span className="relative flex h-12 w-20 shrink-0 items-center justify-center rounded bg-slate-800 text-white"><Play className="h-4 w-4" />{item.durationSecs !== null ? <small className="absolute bottom-0.5 right-1 text-[9px]">{formatDuration(item.durationSecs)}</small> : null}</span><span className="min-w-0"><span className="line-clamp-2 text-sm font-medium text-ink">{item.title}</span><span className="mt-1 block text-xs text-ink-muted">{item.nodeTitle}</span></span></Link>; })}</div></aside> : null}</div></div>;
}
