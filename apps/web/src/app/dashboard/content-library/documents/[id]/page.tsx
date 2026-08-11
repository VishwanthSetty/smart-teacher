import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { PageHeader } from '@/components/ui/page-header';
import { canRoleAccess } from '@/lib/nav';
import { getAccessToken, requireUser } from '@/lib/session';
import { ApiError, apiGetAdminDocument, apiListCurricula } from '@/lib/api-client';
import { DocumentActions } from '../../_components/document-actions';
import { DocumentMetadataForm } from '../../_components/document-metadata-form';

const ROUTE = '/dashboard/content-library';

export default async function AdminDocumentDetailPage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  if (!canRoleAccess(user.role, ROUTE)) redirect('/dashboard');
  const token = getAccessToken() ?? '';
  const document = await apiGetAdminDocument(token, params.id).catch((error) => {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  });
  if (!document) notFound();
  const curricula = await apiListCurricula(token, { limit: 200 });

  return (
    <div className="flex flex-col gap-6">
      <Link href={`${ROUTE}?kind=documents`} className="text-sm text-gray-600 hover:text-gray-900">
        ← All documents
      </Link>
      <PageHeader
        title={document.title}
        description={`${document.status} · created ${new Date(document.createdAt).toLocaleString()}`}
      />
      {document.failureReason && (
        <div className="rounded border border-red-200 bg-red-50 p-4 text-red-800">
          {document.failureReason}
        </div>
      )}
      <DocumentMetadataForm document={document} curricula={curricula.data} />
      <DocumentActions document={document} />
    </div>
  );
}
