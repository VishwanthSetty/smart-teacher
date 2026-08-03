import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { VideoStatus } from '@smart-teacher/shared-types';
import { PageHeader } from '@/components/ui/page-header';
import { canRoleAccess } from '@/lib/nav';
import { getAccessToken, requireUser } from '@/lib/session';
import { ApiError, apiCreatePlayback, apiGetAdminVideo, apiGetContentImpact, apiListActiveSubjects, apiListAdminGradeLevels } from '@/lib/api-client';
import { HlsPlayer } from '../_components/hls-player';
import { VideoDangerZone } from '../_components/video-danger-zone';
import { VideoMetadataForm } from '../_components/video-metadata-form';

const ROUTE = '/dashboard/content-library';

export default async function VideoDetailPage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  if (!canRoleAccess(user.role, ROUTE)) redirect('/dashboard');
  const token = getAccessToken() ?? '';
  const video = await apiGetAdminVideo(token, params.id).catch((error) => {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  });
  if (!video) notFound();
  const [impact, gradeLevels, subjects, ticket] = await Promise.all([
    apiGetContentImpact(token, video.gradeLevelId, video.subjectId),
    apiListAdminGradeLevels(token), apiListActiveSubjects(token),
    video.status === VideoStatus.READY ? apiCreatePlayback(token, video.id) : Promise.resolve(null),
  ]);
  const apiOrigin = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

  return <div className="flex flex-col gap-6">
    <Link href={ROUTE} className="text-sm text-gray-600 hover:text-gray-900">← All videos</Link>
    <PageHeader title={video.title} description={`${video.status} · created ${new Date(video.createdAt).toLocaleString()}`} />
    {ticket && <HlsPlayer manifestUrl={`${apiOrigin}${ticket.manifestPath}`} posterUrl={ticket.posterPath ? `${apiOrigin}${ticket.posterPath}` : undefined} />}
    {video.failureReason && <div className="rounded border border-red-200 bg-red-50 p-4 text-red-800">{video.failureReason}</div>}
    <VideoMetadataForm video={video} gradeLevels={gradeLevels} subjects={subjects} />
    <section className="rounded-lg border bg-white p-5"><h2 className="font-semibold">Transcode output</h2><dl className="mt-3 grid gap-3 text-sm md:grid-cols-3"><div><dt className="text-gray-500">Duration</dt><dd>{video.durationSecs ?? '—'} seconds</dd></div><div><dt className="text-gray-500">Attempts</dt><dd>{video.transcodeAttempts}</dd></div><div><dt className="text-gray-500">Source key</dt><dd className="break-all font-mono text-xs">{video.sourceKey ?? 'removed'}</dd></div><div><dt className="text-gray-500">Playlist key</dt><dd className="break-all font-mono text-xs">{video.playlistKey ?? '—'}</dd></div><div><dt className="text-gray-500">Poster key</dt><dd className="break-all font-mono text-xs">{video.posterKey ?? '—'}</dd></div></dl>
      <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="py-2">Rendition</th><th>Dimensions</th><th>Bitrate</th><th>Key</th></tr></thead><tbody>{video.renditions.map((r) => <tr key={r.id} className="border-t"><td className="py-2">{r.name}</td><td>{r.width}×{r.height}</td><td>{r.bitrateKbps} kbps</td><td className="font-mono text-xs">{r.playlistKey}</td></tr>)}</tbody></table></div>
    </section>
    <VideoDangerZone id={video.id} title={video.title} status={video.status} impact={impact} canRetry={video.sourceKey !== null} />
  </div>;
}
