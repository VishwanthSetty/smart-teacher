import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ApiError, apiGetDocument, apiGetDocumentDownload } from '@/lib/api-client';
import { canRoleAccess } from '@/lib/nav';
import { getAccessToken, requireUser } from '@/lib/session';
import { PageHeader } from '@/components/ui/page-header';

export default async function DocumentDetailPage({ params, searchParams }: { params: { curriculumId: string; documentId: string }; searchParams: { audience?: string } }) {
  const user = await requireUser();
  if (!canRoleAccess(user.role, '/dashboard/videos')) redirect('/dashboard');
  const token = getAccessToken() ?? '';
  const document = await apiGetDocument(token, params.documentId).catch((error) => {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  });
  if (!document || document.curriculumId !== params.curriculumId) notFound();
  const download = await apiGetDocumentDownload(token, document.id);
  return (
    <div className="grid gap-6">
      <Link href={`/dashboard/videos/${params.curriculumId}?audience=${encodeURIComponent(searchParams.audience ?? '')}`} className="text-sm text-gray-600 hover:text-gray-900">← Curriculum</Link>
      <PageHeader title={document.title} description={document.contentNodeTitle} />
      <a href={`/api/documents/${document.id}/download`} className="w-fit rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700">Download PDF</a>
      <iframe src={download.url} title={document.title} className="h-[75vh] w-full rounded-lg border border-gray-200 bg-white" />
      {document.description && <p className="whitespace-pre-line text-sm text-gray-600">{document.description}</p>}
    </div>
  );
}
