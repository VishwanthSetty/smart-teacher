import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Download } from 'lucide-react';
import { DocumentStatus } from '@smart-teacher/shared-types';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { canRoleAccess } from '@/lib/nav';
import { getAccessToken, requireUser } from '@/lib/session';
import {
  ApiError,
  apiGetAdminDocument,
  apiGetAdminDocumentDownload,
  apiListCurricula,
} from '@/lib/api-client';
import { DocumentActions } from '../../_components/document-actions';
import { DocumentMetadataForm } from '../../_components/document-metadata-form';

const ROUTE = '/dashboard/content-library';

export default async function AdminDocumentDetailPage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  if (!canRoleAccess(user.role, ROUTE)) redirect('/dashboard');
  const token = getAccessToken() ?? '';
  const document = await apiGetAdminDocument(token, params.id).catch((error: unknown) => {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  });
  if (!document) notFound();
  const [curricula, download] = await Promise.all([
    apiListCurricula(token, { limit: 200 }),
    document.status === DocumentStatus.READY
      ? apiGetAdminDocumentDownload(token, document.id)
      : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-6">
      <Link href={`${ROUTE}?kind=documents`} className="text-sm font-medium text-brand-blue hover:text-brand-navy">← All documents</Link>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <PageHeader title={document.title} description={`Created ${new Date(document.createdAt).toLocaleString()}`} />
          <StatusBadge status={document.status} />
        </div>
        {download ? <ButtonLink href={download.url} variant="secondary"><Download className="h-4 w-4" /> Download PDF</ButtonLink> : null}
      </div>
      {document.failureReason ? <div className="rounded-card border border-red-200 bg-red-50 p-4 text-status-danger">{document.failureReason}</div> : null}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="overflow-hidden rounded-card border border-surface-border bg-slate-100 shadow-card">
          {download ? (
            <iframe title={document.title} src={download.url} className="h-[75vh] min-h-[560px] w-full bg-white" />
          ) : (
            <div className="flex h-96 items-center justify-center text-sm text-ink-muted">The PDF preview is available once the document is ready.</div>
          )}
        </div>
        <aside className="space-y-6">
          <DocumentMetadataForm document={document} curricula={curricula.data} />
          <DocumentActions document={document} />
        </aside>
      </div>
    </div>
  );
}
