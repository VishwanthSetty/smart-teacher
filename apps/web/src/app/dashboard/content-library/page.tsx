import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, BookOpen, GraduationCap, Video } from 'lucide-react';
import { VideoStatus } from '@smart-teacher/shared-types';
import { apiListActiveSubjects, apiListAdminGradeLevels, apiListAdminVideos, apiListCurricula } from '@/lib/api-client';
import { canRoleAccess } from '@/lib/nav';
import { getAccessToken, requireUser } from '@/lib/session';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { VideoIngestPanel } from './_components/video-ingest-panel';

const ROUTE = '/dashboard/content-library';
const STATUS_CLASS: Record<VideoStatus, string> = {
  READY: 'text-green-700', PROCESSING: 'text-blue-700', QUEUED: 'text-amber-700',
  UPLOADING: 'text-gray-600', FAILED: 'text-red-700',
};
// The admin video list caps `limit` at 100 server-side (see list-admin-videos-query.dto.ts).
// The two card levels reuse that endpoint to derive per-grade / per-subject counts, so a
// catalogue past 100 matching videos undercounts on those cards until a narrower search or
// grade selection brings the matching set under the cap — the leaf video list still paginates
// the real filtered query, so it stays exact regardless of catalogue size.
const CATALOG_SCAN_LIMIT = 100;

interface SearchParams { status?: VideoStatus; gradeLevelId?: string; subjectId?: string; search?: string; page?: string }

function buildHref(base: SearchParams, changes: Partial<SearchParams>): string {
  const params = new URLSearchParams();
  // Any navigation that changes scope (grade, subject, search, status) invalidates the
  // current page number, so page is dropped by default unless the change re-supplies it
  // (pagination links do exactly that).
  const next: SearchParams = { ...base, page: undefined, ...changes };
  for (const [key, value] of Object.entries(next)) if (value) params.set(key, value);
  const query = params.toString();
  return query ? `${ROUTE}?${query}` : ROUTE;
}

function countBy(videos: { gradeLevelId: string; subjectId: string }[], key: 'gradeLevelId' | 'subjectId'): Map<string, number> {
  const counts = new Map<string, number>();
  for (const video of videos) counts.set(video[key], (counts.get(video[key]) ?? 0) + 1);
  return counts;
}

export default async function ContentLibraryPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  if (!canRoleAccess(user.role, ROUTE)) redirect('/dashboard');
  const accessToken = getAccessToken() ?? '';

  const [gradeLevels, subjects, curricula] = await Promise.all([
    apiListAdminGradeLevels(accessToken),
    apiListActiveSubjects(accessToken),
    // For the ingest panel's node picker. A high limit rather than pagination: the picker
    // is a select, and the platform's curriculum count is bounded by grades x subjects.
    apiListCurricula(accessToken, { limit: 200 }),
  ]);
  const gradeNames = new Map(gradeLevels.map((item) => [item.id, item.name]));
  const subjectNames = new Map(subjects.map((item) => [item.id, item.name]));

  // A subject only makes sense once a grade is chosen — a hand-edited URL that skips
  // straight to a subject is treated as if the grade weren't picked yet.
  const gradeLevelId = searchParams.gradeLevelId || undefined;
  const subjectId = gradeLevelId ? searchParams.subjectId || undefined : undefined;
  const page = Math.max(1, Number(searchParams.page) || 1);

  const result = await apiListAdminVideos(accessToken, {
    ...searchParams,
    gradeLevelId,
    subjectId,
    page: subjectId ? page : 1,
    limit: subjectId ? 20 : CATALOG_SCAN_LIMIT,
  });
  const scanTruncated = !subjectId && result.meta.total > result.data.length;

  return <div className="flex flex-col gap-6">
    <PageHeader title="Content Library" description="Find, inspect, preview, correct, and retire platform videos." />
    <VideoIngestPanel curricula={curricula.data} />

    <div className="flex flex-wrap items-center gap-4">
      {gradeLevelId && (
        <Link
          href={subjectId ? buildHref(searchParams, { subjectId: undefined }) : buildHref(searchParams, { gradeLevelId: undefined, subjectId: undefined })}
          className="flex items-center gap-1 text-sm font-medium text-gray-700 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back
        </Link>
      )}
      <nav className="flex flex-wrap items-center gap-1 text-sm text-gray-500" aria-label="Breadcrumb">
        <Link href={buildHref(searchParams, { gradeLevelId: undefined, subjectId: undefined })} className={gradeLevelId ? 'hover:underline' : 'font-medium text-gray-900'}>
          All classes
        </Link>
        {gradeLevelId && <>
          <span aria-hidden="true">/</span>
          <Link href={buildHref(searchParams, { subjectId: undefined })} className={subjectId ? 'hover:underline' : 'font-medium text-gray-900'}>
            {gradeNames.get(gradeLevelId) ?? 'Unknown grade'}
          </Link>
        </>}
        {subjectId && <>
          <span aria-hidden="true">/</span>
          <span className="font-medium text-gray-900">{subjectNames.get(subjectId) ?? 'Unknown subject'}</span>
        </>}
      </nav>
    </div>

    <form className="grid gap-3 rounded-lg border bg-white p-4 sm:grid-cols-3" action={ROUTE}>
      <input type="hidden" name="gradeLevelId" value={gradeLevelId ?? ''} />
      <input type="hidden" name="subjectId" value={subjectId ?? ''} />
      <input name="search" defaultValue={searchParams.search} placeholder="Search titles" className="rounded-md border px-3 py-2" />
      <select name="status" defaultValue={searchParams.status ?? ''} className="rounded-md border px-3 py-2">
        <option value="">All statuses</option>{Object.values(VideoStatus).map((status) => <option key={status}>{status}</option>)}
      </select>
      <div className="flex items-center gap-3">
        <button className="rounded-md bg-gray-900 px-4 py-2 text-white">Apply filters</button>
        <Link href={buildHref(searchParams, { search: undefined, status: undefined })} className="text-sm text-gray-600">Clear</Link>
      </div>
    </form>

    {!gradeLevelId && (
      gradeLevels.length === 0 ? (
        <EmptyState icon={<GraduationCap className="h-8 w-8" aria-hidden="true" />} title="No grade levels yet" description="Grade levels are set up by a super admin before videos can be catalogued." />
      ) : (
        <div className="flex flex-col gap-2">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {gradeLevels.map((grade) => {
              const count = countBy(result.data, 'gradeLevelId').get(grade.id) ?? 0;
              return (
                <Link key={grade.id} href={buildHref(searchParams, { gradeLevelId: grade.id })} className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition hover:border-gray-400">
                  <GraduationCap className="h-6 w-6 text-gray-400" aria-hidden="true" />
                  <h2 className="font-medium text-gray-900">{grade.name}</h2>
                  <p className="text-sm text-gray-500">{count} {count === 1 ? 'video' : 'videos'}</p>
                </Link>
              );
            })}
          </div>
          {scanTruncated && <p className="text-xs text-gray-400">Counts reflect the first {CATALOG_SCAN_LIMIT} matching videos — narrow your search for exact totals.</p>}
        </div>
      )
    )}

    {gradeLevelId && !subjectId && (
      subjects.length === 0 ? (
        <EmptyState icon={<BookOpen className="h-8 w-8" aria-hidden="true" />} title="No subjects yet" description="Subjects are set up by a super admin before videos can be catalogued." />
      ) : (
        <div className="flex flex-col gap-2">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {subjects.map((subject) => {
              const count = countBy(result.data, 'subjectId').get(subject.id) ?? 0;
              return (
                <Link key={subject.id} href={buildHref(searchParams, { subjectId: subject.id })} className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition hover:border-gray-400">
                  <BookOpen className="h-6 w-6 text-gray-400" aria-hidden="true" />
                  <h2 className="font-medium text-gray-900">{subject.name}</h2>
                  <p className="text-sm text-gray-500">{count} {count === 1 ? 'video' : 'videos'}</p>
                </Link>
              );
            })}
          </div>
          {scanTruncated && <p className="text-xs text-gray-400">Counts reflect the first {CATALOG_SCAN_LIMIT} matching videos — narrow your search for exact totals.</p>}
        </div>
      )
    )}

    {subjectId && (
      result.data.length === 0 ? (
        <EmptyState icon={<Video className="h-8 w-8" aria-hidden="true" />} title="No videos match" description="No videos match these filters yet." />
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border bg-white shadow-sm"><table className="w-full text-left text-sm">
            <thead className="border-b text-gray-500"><tr><th className="px-4 py-3">Title</th><th className="px-4 py-3">Filed under</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Size</th></tr></thead>
            <tbody>{result.data.map((video) => <tr key={video.id} className="border-b last:border-0">
              <td className="px-4 py-3"><Link className="font-medium hover:underline" href={`${ROUTE}/${video.id}`}>{video.title}</Link>{video.failureReason && <p className="text-xs text-red-600">{video.failureReason}</p>}</td>
              <td className="px-4 py-3 text-gray-600">{video.contentNodeTitle}</td>
              <td className={`px-4 py-3 ${STATUS_CLASS[video.status]}`}>{video.status}</td><td className="px-4 py-3">{video.sizeBytes === null ? '—' : `${(video.sizeBytes / 1048576).toFixed(1)} MB`}</td>
            </tr>)}</tbody>
          </table></div>
          <div className="flex items-center justify-between text-sm"><span>{result.meta.total} videos</span><div className="flex gap-2">
            {page > 1 && <Link className="rounded border px-3 py-1" href={buildHref(searchParams, { page: String(page - 1) })}>Previous</Link>}
            {page < result.meta.totalPages && <Link className="rounded border px-3 py-1" href={buildHref(searchParams, { page: String(page + 1) })}>Next</Link>}
          </div></div>
        </>
      )
    )}
  </div>;
}
