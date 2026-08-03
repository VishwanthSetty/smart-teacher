import Link from 'next/link';
import { redirect } from 'next/navigation';
import { VideoStatus } from '@smart-teacher/shared-types';
import { apiListActiveSubjects, apiListAdminGradeLevels, apiListAdminVideos } from '@/lib/api-client';
import { canRoleAccess } from '@/lib/nav';
import { getAccessToken, requireUser } from '@/lib/session';
import { PageHeader } from '@/components/ui/page-header';
import { VideoIngestPanel } from './_components/video-ingest-panel';

const ROUTE = '/dashboard/content-library';
const STATUS_CLASS: Record<VideoStatus, string> = {
  READY: 'text-green-700', PROCESSING: 'text-blue-700', QUEUED: 'text-amber-700',
  UPLOADING: 'text-gray-600', FAILED: 'text-red-700',
};

interface SearchParams { status?: VideoStatus; gradeLevelId?: string; subjectId?: string; search?: string; page?: string }

function buildHref(query: SearchParams, changes: Partial<SearchParams>): string {
  const params = new URLSearchParams();
  const next = { ...query, ...changes };
  for (const [key, value] of Object.entries(next)) if (value) params.set(key, value);
  return `${ROUTE}?${params.toString()}`;
}

export default async function ContentLibraryPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  if (!canRoleAccess(user.role, ROUTE)) redirect('/dashboard');
  const accessToken = getAccessToken() ?? '';
  const page = Math.max(1, Number(searchParams.page) || 1);
  const [result, gradeLevels, subjects] = await Promise.all([
    apiListAdminVideos(accessToken, { ...searchParams, page, limit: 20 }),
    apiListAdminGradeLevels(accessToken),
    apiListActiveSubjects(accessToken),
  ]);
  const gradeNames = new Map(gradeLevels.map((item) => [item.id, item.name]));
  const subjectNames = new Map(subjects.map((item) => [item.id, item.name]));

  return <div className="flex flex-col gap-6">
    <PageHeader title="Content Library" description="Find, inspect, preview, correct, and retire platform videos." />
    <VideoIngestPanel gradeLevels={gradeLevels} subjects={subjects} />
    <form className="grid gap-3 rounded-lg border bg-white p-4 md:grid-cols-4">
      <input name="search" defaultValue={searchParams.search} placeholder="Search titles" className="rounded-md border px-3 py-2" />
      <select name="status" defaultValue={searchParams.status ?? ''} className="rounded-md border px-3 py-2">
        <option value="">All statuses</option>{Object.values(VideoStatus).map((status) => <option key={status}>{status}</option>)}
      </select>
      <select name="gradeLevelId" defaultValue={searchParams.gradeLevelId ?? ''} className="rounded-md border px-3 py-2">
        <option value="">All grades</option>{gradeLevels.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
      </select>
      <select name="subjectId" defaultValue={searchParams.subjectId ?? ''} className="rounded-md border px-3 py-2">
        <option value="">All subjects</option>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <button className="rounded-md bg-gray-900 px-4 py-2 text-white">Apply filters</button>
      <Link href={ROUTE} className="px-2 py-2 text-sm text-gray-600">Clear</Link>
    </form>
    <div className="overflow-x-auto rounded-lg border bg-white shadow-sm"><table className="w-full text-left text-sm">
      <thead className="border-b text-gray-500"><tr><th className="px-4 py-3">Title</th><th className="px-4 py-3">Grade</th><th className="px-4 py-3">Subject</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Size</th></tr></thead>
      <tbody>{result.data.length === 0 ? <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">No videos match these filters.</td></tr> : result.data.map((video) => <tr key={video.id} className="border-b last:border-0">
        <td className="px-4 py-3"><Link className="font-medium hover:underline" href={`${ROUTE}/${video.id}`}>{video.title}</Link>{video.failureReason && <p className="text-xs text-red-600">{video.failureReason}</p>}</td>
        <td className="px-4 py-3">{gradeNames.get(video.gradeLevelId) ?? '—'}</td><td className="px-4 py-3">{subjectNames.get(video.subjectId) ?? '—'}</td>
        <td className={`px-4 py-3 ${STATUS_CLASS[video.status]}`}>{video.status}</td><td className="px-4 py-3">{video.sizeBytes === null ? '—' : `${(video.sizeBytes / 1048576).toFixed(1)} MB`}</td>
      </tr>)}</tbody>
    </table></div>
    <div className="flex items-center justify-between text-sm"><span>{result.meta.total} videos</span><div className="flex gap-2">
      {page > 1 && <Link className="rounded border px-3 py-1" href={buildHref(searchParams, { page: String(page - 1) })}>Previous</Link>}
      {page < result.meta.totalPages && <Link className="rounded border px-3 py-1" href={buildHref(searchParams, { page: String(page + 1) })}>Next</Link>}
    </div></div>
  </div>;
}
