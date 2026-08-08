import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ApiError, apiGetPlaybackToken, apiGetVideo } from '@/lib/api-client';
import { formatDuration } from '@/lib/format';
import { canRoleAccess } from '@/lib/nav';
import { getAccessToken, requireUser } from '@/lib/session';
import { PageHeader } from '@/components/ui/page-header';
import { HlsPlayer } from '@/components/video/hls-player';

export default async function VideoDetailPage({ params }: { params: { curriculumId: string; videoId: string } }) {
  const user = await requireUser(); if (!canRoleAccess(user.role, '/dashboard/videos')) redirect('/dashboard'); const token = getAccessToken() ?? '';
  const video = await apiGetVideo(token, params.videoId).catch((error) => { if (error instanceof ApiError && error.status === 404) return null; throw error; });
  if (!video || video.curriculumId !== params.curriculumId) notFound();
  const ticket = await apiGetPlaybackToken(token, video.id).catch(() => null);
  return <div className="grid gap-6"><Link href={`/dashboard/videos/${params.curriculumId}`} className="text-sm text-gray-600 hover:text-gray-900">← Curriculum</Link><PageHeader title={video.title} description={[video.contentNodeTitle, video.durationSecs === null ? null : formatDuration(video.durationSecs)].filter(Boolean).join(' · ')} /><HlsPlayer videoId={video.id} title={video.title} posterUrl={ticket?.posterUrl ?? undefined} />{video.description && <section className="rounded-lg border bg-white p-5 shadow-sm"><h2 className="font-semibold">About this lesson</h2><p className="mt-2 whitespace-pre-line text-sm text-gray-600">{video.description}</p></section>}</div>;
}
