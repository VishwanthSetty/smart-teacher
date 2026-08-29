import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { VideoStatus } from '@smart-teacher/shared-types';
import { canRoleAccess } from '@/lib/nav';
import { getAccessToken, requireUser } from '@/lib/session';
import { ApiError, apiGetPlaybackToken, apiGetAdminVideo, apiGetContentImpact, apiListCurricula } from '@/lib/api-client';
import { HlsPlayer } from '@/components/video/hls-player';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { VideoDangerZone } from '../_components/video-danger-zone';
import { VideoMetadataForm } from '../_components/video-metadata-form';

const ROUTE = '/dashboard/content-library';

export default async function VideoDetailPage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  if (!canRoleAccess(user.role, ROUTE)) redirect('/dashboard');
  const token = getAccessToken() ?? '';
  const video = await apiGetAdminVideo(token, params.id).catch((error: unknown) => {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  });
  if (!video) notFound();

  const [impact, curricula, ticket] = await Promise.all([
    apiGetContentImpact(token, video.curriculumId),
    apiListCurricula(token, { limit: 200 }),
    video.status === VideoStatus.READY ? apiGetPlaybackToken(token, video.id) : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-6">
      <Link href={ROUTE} className="text-sm font-medium text-brand-blue hover:text-brand-navy">← All videos</Link>
      <div className="flex flex-wrap items-end gap-3">
        <PageHeader title={video.title} description={`Created ${new Date(video.createdAt).toLocaleString()}`} />
        <StatusBadge status={video.status} />
      </div>

      {video.failureReason ? (
        <div className="rounded-card border border-red-200 bg-red-50 p-4 text-sm text-status-danger">
          <span className="font-semibold">Transcode failed.</span> {video.failureReason}
        </div>
      ) : null}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-6">
          {ticket ? <HlsPlayer videoId={video.id} title={video.title} posterUrl={ticket.posterUrl ?? undefined} /> : null}
          <VideoMetadataForm video={video} curricula={curricula.data} />
        </div>
        <aside className="space-y-6">
          <Card className="p-5">
            <h2 className="font-semibold text-ink">Transcode output</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-ink-muted">Duration</dt><dd>{video.durationSecs ?? '—'} seconds</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-ink-muted">Attempts</dt><dd>{video.transcodeAttempts}</dd></div>
              <div><dt className="text-ink-muted">Source key</dt><dd className="mt-1 break-all font-mono text-xs">{video.sourceKey ?? 'removed'}</dd></div>
              <div><dt className="text-ink-muted">Playlist key</dt><dd className="mt-1 break-all font-mono text-xs">{video.playlistKey ?? '—'}</dd></div>
              <div><dt className="text-ink-muted">Poster key</dt><dd className="mt-1 break-all font-mono text-xs">{video.posterKey ?? '—'}</dd></div>
            </dl>
            {video.renditions.length ? (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-ink-muted"><tr><th className="py-2">Rendition</th><th>Dimensions</th><th>Bitrate</th></tr></thead>
                  <tbody>{video.renditions.map((rendition) => (
                    <tr key={rendition.id} className="border-t border-surface-border"><td className="py-2">{rendition.name}</td><td>{rendition.width}×{rendition.height}</td><td>{rendition.bitrateKbps} kbps</td></tr>
                  ))}</tbody>
                </table>
              </div>
            ) : null}
          </Card>
          <VideoDangerZone id={video.id} title={video.title} status={video.status} impact={impact} canRetry={video.sourceKey !== null} />
        </aside>
      </div>
    </div>
  );
}
