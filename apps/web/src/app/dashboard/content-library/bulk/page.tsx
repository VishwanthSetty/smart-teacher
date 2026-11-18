import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { apiListCurricula } from '@/lib/api-client';
import { canRoleAccess } from '@/lib/nav';
import { getAccessToken, requireUser } from '@/lib/session';
import { PageHeader } from '@/components/ui/page-header';
import { BulkUploadWorkspace } from './_components/bulk-upload-workspace';

const LIBRARY_ROUTE = '/dashboard/content-library';

export default async function BulkUploadPage() {
  const user = await requireUser();
  if (!canRoleAccess(user.role, LIBRARY_ROUTE)) redirect('/dashboard');

  // The same high limit as the library's ingest panels: the picker is a select, and the
  // platform's curriculum count is bounded by grades x subjects.
  const curricula = await apiListCurricula(getAccessToken() ?? '', { limit: 200 });

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={LIBRARY_ROUTE}
        className="flex w-fit items-center gap-1 text-sm font-medium text-brand-blue hover:text-brand-navy"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Content Library
      </Link>
      <PageHeader
        title="Bulk upload"
        description="Upload many videos and PDFs at once. Stay on this page until every file has finished, because leaving it cancels the uploads in progress."
      />
      <BulkUploadWorkspace curricula={curricula.data} />
    </div>
  );
}
