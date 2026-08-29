import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { ApiError, apiGetDocument, apiGetDocumentDownload } from '@/lib/api-client';
import { canRoleAccess } from '@/lib/nav';
import { getAccessToken, requireUser } from '@/lib/session';
import { buttonClassName } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';

export default async function DocumentDetailPage({ params, searchParams }: { params: { curriculumId: string; documentId: string }; searchParams: { audience?: string } }) {
  const user = await requireUser(); if (!canRoleAccess(user.role, '/dashboard/videos')) redirect('/dashboard/forbidden'); const token = getAccessToken() ?? '';
  const document = await apiGetDocument(token, params.documentId).catch((error) => { if (error instanceof ApiError && error.status === 404) return null; throw error; });
  if (!document || document.curriculumId !== params.curriculumId) notFound();
  const download = await apiGetDocumentDownload(token, document.id);
  return <div className="grid gap-6"><Link href={`/dashboard/videos/${params.curriculumId}?audience=${encodeURIComponent(searchParams.audience ?? '')}`} className="w-fit text-sm font-medium text-ink-muted hover:text-brand-blue">← Curriculum</Link><PageHeader title={document.title} description={document.contentNodeTitle} action={<a href={`/api/documents/${document.id}/download`} className={buttonClassName()}><Download className="h-4 w-4" /> Download PDF</a>} /><div className="overflow-hidden rounded-card border border-surface-border bg-white shadow-card"><iframe src={download.url} title={document.title} className="h-[75vh] w-full bg-white" /><div className="flex items-center justify-center gap-4 border-t border-surface-border px-4 py-3 text-sm text-ink-muted"><button type="button" disabled className="rounded-md p-1.5 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button><span>Use the viewer controls to navigate pages</span><button type="button" disabled className="rounded-md p-1.5 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button></div></div>{document.description ? <p className="whitespace-pre-line text-sm leading-6 text-ink-muted">{document.description}</p> : null}</div>;
}
