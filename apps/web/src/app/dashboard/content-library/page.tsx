import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, BookOpen, FileText, GraduationCap, Upload, Video } from 'lucide-react';
import { VideoStatus } from '@smart-teacher/shared-types';
import { apiListActiveSubjects, apiListAdminDocuments, apiListAdminGradeLevels, apiListAdminVideos, apiListCurricula } from '@/lib/api-client';
import { canRoleAccess } from '@/lib/nav';
import { getAccessToken, requireUser } from '@/lib/session';
import { ButtonLink } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { VideoIngestPanel } from './_components/video-ingest-panel';
import { DocumentIngestPanel } from './_components/document-ingest-panel';
import { StatusBadge } from '@/components/ui/badge';

const ROUTE = '/dashboard/content-library';
// The admin video list caps `limit` at 100 server-side (see list-admin-videos-query.dto.ts).
// The two card levels reuse that endpoint to derive per-grade / per-subject counts, so a
// catalogue past 100 matching videos undercounts on those cards until a narrower search or
// grade selection brings the matching set under the cap — the leaf video list still paginates
// the real filtered query, so it stays exact regardless of catalogue size.
const CATALOG_SCAN_LIMIT = 100;

interface SearchParams { kind?: 'videos' | 'documents'; status?: VideoStatus; gradeLevelId?: string; subjectId?: string; search?: string; page?: string }

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
  const kind = searchParams.kind === 'documents' ? 'documents' : 'videos';

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
  const documents = await apiListAdminDocuments(accessToken, { limit: 100 });
  const scanTruncated = !subjectId && result.meta.total > result.data.length;

  return <div className="flex flex-col gap-6">
    <PageHeader
      title="Content Library"
      description="Find, inspect, and manage platform videos and PDF documents."
      action={<ButtonLink href={`${ROUTE}/bulk`} variant="secondary"><Upload className="h-4 w-4" aria-hidden="true" />Bulk upload</ButtonLink>}
    />
    <nav className="inline-flex w-fit rounded-full border border-surface-border bg-white p-1 text-sm shadow-card" aria-label="Content type">
      <Link href={`${ROUTE}?kind=videos`} className={`rounded-full px-4 py-2 font-medium ${kind === 'videos' ? 'bg-brand-navy text-white' : 'text-ink-muted hover:bg-brand-tint'}`}>Videos</Link>
      <Link href={`${ROUTE}?kind=documents`} className={`rounded-full px-4 py-2 font-medium ${kind === 'documents' ? 'bg-brand-navy text-white' : 'text-ink-muted hover:bg-brand-tint'}`}>Documents</Link>
    </nav>
    {kind === 'videos' ? <VideoIngestPanel curricula={curricula.data} /> : <DocumentIngestPanel curricula={curricula.data} />}

    {kind === 'videos' && <>
    <div className="flex flex-wrap items-center gap-4">
      {gradeLevelId && (
        <Link
          href={subjectId ? buildHref(searchParams, { subjectId: undefined }) : buildHref(searchParams, { gradeLevelId: undefined, subjectId: undefined })}
          className="flex items-center gap-1 text-sm font-medium text-brand-blue hover:text-brand-navy"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back
        </Link>
      )}
      <nav className="flex flex-wrap items-center gap-1 text-sm text-ink-muted" aria-label="Breadcrumb">
        <Link href={buildHref(searchParams, { gradeLevelId: undefined, subjectId: undefined })} className={gradeLevelId ? 'text-brand-blue hover:underline' : 'font-medium text-ink'}>
          All classes
        </Link>
        {gradeLevelId && <>
          <span aria-hidden="true">/</span>
          <Link href={buildHref(searchParams, { subjectId: undefined })} className={subjectId ? 'text-brand-blue hover:underline' : 'font-medium text-ink'}>
            {gradeNames.get(gradeLevelId) ?? 'Unknown grade'}
          </Link>
        </>}
        {subjectId && <>
          <span aria-hidden="true">/</span>
          <span className="font-medium text-ink">{subjectNames.get(subjectId) ?? 'Unknown subject'}</span>
        </>}
      </nav>
    </div>

    <form className="grid gap-3 rounded-card border border-surface-border bg-white p-4 shadow-card sm:grid-cols-3" action={ROUTE}>
      <input type="hidden" name="gradeLevelId" value={gradeLevelId ?? ''} />
      <input type="hidden" name="subjectId" value={subjectId ?? ''} />
      <input name="search" defaultValue={searchParams.search} placeholder="Search titles" className="field" />
      <select name="status" defaultValue={searchParams.status ?? ''} className="field">
        <option value="">All statuses</option>{Object.values(VideoStatus).map((status) => <option key={status}>{status}</option>)}
      </select>
      <div className="flex items-center gap-3">
        <button className="h-10 rounded-lg bg-brand-blue px-4 text-sm font-medium text-white hover:bg-brand-navy">Apply filters</button>
        <Link href={buildHref(searchParams, { search: undefined, status: undefined })} className="text-sm font-medium text-brand-blue">Clear</Link>
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
                <Link key={grade.id} href={buildHref(searchParams, { gradeLevelId: grade.id })} className="flex flex-col gap-3 rounded-card border border-surface-border bg-white p-5 shadow-card transition hover:-translate-y-0.5 hover:border-brand-soft">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-tint text-brand-blue"><GraduationCap className="h-5 w-5" aria-hidden="true" /></span>
                  <h2 className="font-medium text-ink">{grade.name}</h2>
                  <p className="text-sm text-ink-muted">{count} {count === 1 ? 'video' : 'videos'}</p>
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
                <Link key={subject.id} href={buildHref(searchParams, { subjectId: subject.id })} className="flex flex-col gap-3 rounded-card border border-surface-border bg-white p-5 shadow-card transition hover:-translate-y-0.5 hover:border-brand-soft">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-tint text-brand-blue"><BookOpen className="h-5 w-5" aria-hidden="true" /></span>
                  <h2 className="font-medium text-ink">{subject.name}</h2>
                  <p className="text-sm text-ink-muted">{count} {count === 1 ? 'video' : 'videos'}</p>
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
          <div className="overflow-x-auto rounded-card border border-surface-border bg-white shadow-card"><table className="w-full text-left text-sm">
            <thead className="border-b border-surface-border bg-slate-50/70 text-xs uppercase tracking-wider text-ink-muted"><tr><th className="px-4 py-3">Title</th><th className="px-4 py-3">Filed under</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Size</th></tr></thead>
            <tbody>{result.data.map((video) => <tr key={video.id} className="h-12 border-b border-surface-border last:border-0 hover:bg-brand-tint/60">
              <td className="px-4 py-3"><Link className="font-medium hover:text-brand-blue" href={`${ROUTE}/${video.id}`}>{video.title}</Link>{video.failureReason && <p className="text-xs text-status-danger">{video.failureReason}</p>}</td>
              <td className="px-4 py-3 text-ink-muted">{video.contentNodeTitle}</td>
              <td className="px-4 py-3"><StatusBadge status={video.status} /></td><td className="px-4 py-3">{video.sizeBytes === null ? '—' : `${(video.sizeBytes / 1048576).toFixed(1)} MB`}</td>
            </tr>)}</tbody>
          </table></div>
          <div className="flex items-center justify-between text-sm text-ink-muted"><span>{result.meta.total} videos</span><div className="flex gap-2">
            {page > 1 && <Link className="rounded-lg border border-surface-border bg-white px-3 py-1.5 hover:bg-brand-tint" href={buildHref(searchParams, { page: String(page - 1) })}>Previous</Link>}
            {page < result.meta.totalPages && <Link className="rounded-lg border border-surface-border bg-white px-3 py-1.5 hover:bg-brand-tint" href={buildHref(searchParams, { page: String(page + 1) })}>Next</Link>}
          </div></div>
        </>
      )
    )}
    </>}
    {kind === 'documents' && <section className="grid gap-3" aria-labelledby="documents-heading">
      <h2 id="documents-heading" className="text-lg font-semibold">Documents</h2>
      {documents.data.length === 0 ? (
        <EmptyState icon={<FileText className="h-8 w-8" aria-hidden="true" />} title="No documents yet" description="Upload the first PDF using the panel above." />
      ) : (
        <div className="overflow-x-auto rounded-card border border-surface-border bg-white shadow-card"><table className="w-full text-left text-sm"><thead className="border-b border-surface-border bg-slate-50/70 text-xs uppercase tracking-wider text-ink-muted"><tr><th className="px-4 py-3">Title</th><th className="px-4 py-3">Filed under</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Size</th></tr></thead><tbody>{documents.data.map((document) => <tr key={document.id} className="h-12 border-b border-surface-border last:border-0 hover:bg-brand-tint/60"><td className="px-4 py-3 font-medium"><Link className="hover:text-brand-blue" href={`${ROUTE}/documents/${document.id}`}>{document.title}</Link>{document.failureReason && <p className="text-xs text-status-danger">{document.failureReason}</p>}</td><td className="px-4 py-3 text-ink-muted">{document.contentNodeTitle}</td><td className="px-4 py-3"><StatusBadge status={document.status} /></td><td className="px-4 py-3">{document.sizeBytes === null ? '—' : `${(document.sizeBytes / 1048576).toFixed(1)} MB`}</td></tr>)}</tbody></table></div>
      )}
    </section>}
  </div>;
}
