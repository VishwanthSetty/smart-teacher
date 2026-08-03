import Link from 'next/link';
import { redirect } from 'next/navigation';
import { SchoolStatus } from '@smart-teacher/shared-types';
import { canRoleAccess } from '@/lib/nav';
import { apiListSchools } from '@/lib/api-client';
import { getAccessToken, requireUser } from '@/lib/session';
import { PageHeader } from '@/components/ui/page-header';

const ROUTE = '/dashboard/entitlements';
const PAGE_SIZE = 20;

function parseStatus(value?: string): SchoolStatus | undefined {
  return value === SchoolStatus.ACTIVE || value === SchoolStatus.SUSPENDED ? value : undefined;
}

export default async function EntitlementsPage({
  searchParams,
}: {
  searchParams: { status?: string; page?: string; search?: string };
}) {
  const user = await requireUser();
  // Real authorization is enforced by the API; this keeps a non-super-admin off a page
  // whose data calls would 403. canRoleAccess reads the same nav table the sidebar does,
  // so the gate cannot drift from the link.
  if (!canRoleAccess(user.role, ROUTE)) {
    redirect('/dashboard');
  }

  const accessToken = getAccessToken() ?? '';

  const status = parseStatus(searchParams.status);
  const search = searchParams.search?.trim() || undefined;
  const page = Math.max(1, Number(searchParams.page) || 1);
  const { data: schools, meta } = await apiListSchools(accessToken, {
    page,
    limit: PAGE_SIZE,
    status,
    search,
  });

  const buildHref = (overrides: { status?: SchoolStatus; search?: string; page?: number }) => {
    const params = new URLSearchParams();
    const nextStatus = 'status' in overrides ? overrides.status : status;
    const nextSearch = 'search' in overrides ? overrides.search : search;
    const nextPage = overrides.page ?? 1;
    if (nextStatus) params.set('status', nextStatus);
    if (nextSearch) params.set('search', nextSearch);
    if (nextPage > 1) params.set('page', String(nextPage));
    const qs = params.toString();
    return qs ? `${ROUTE}?${qs}` : ROUTE;
  };

  const filterHref = (value?: SchoolStatus) => buildHref({ status: value });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="School Entitlements"
        description="Grant schools access to grade level and subject content."
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-500">Filter:</span>
          <Link href={filterHref()} className={!status ? 'font-medium' : 'text-gray-600 hover:text-gray-900'}>
            All
          </Link>
          <Link
            href={filterHref(SchoolStatus.ACTIVE)}
            className={status === SchoolStatus.ACTIVE ? 'font-medium' : 'text-gray-600 hover:text-gray-900'}
          >
            Active
          </Link>
          <Link
            href={filterHref(SchoolStatus.SUSPENDED)}
            className={status === SchoolStatus.SUSPENDED ? 'font-medium' : 'text-gray-600 hover:text-gray-900'}
          >
            Suspended
          </Link>
        </div>

        <form className="flex items-center gap-2">
          {status && <input type="hidden" name="status" value={status} />}
          <input
            type="search"
            name="search"
            defaultValue={search ?? ''}
            placeholder="Search by name, slug, or admin email"
            className="w-72 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-gray-500 focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-gray-100"
          >
            Search
          </button>
          {search && (
            <Link
              href={buildHref({ status, search: undefined })}
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Clear
            </Link>
          )}
        </form>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 text-gray-500">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Slug</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {schools.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-gray-500">
                  {search || status ? 'No schools match this search.' : 'No schools yet.'}
                </td>
              </tr>
            )}
            {schools.map((school) => (
              <tr key={school.id} className="border-b border-gray-100 last:border-0">
                <td className="px-4 py-3 font-medium">
                  <Link href={`${ROUTE}/${school.id}`} className="hover:underline">
                    {school.name}
                  </Link>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-gray-600">{school.slug}</td>
                <td className="px-4 py-3">
                  <span className={school.status === SchoolStatus.ACTIVE ? 'text-green-700' : 'text-red-700'}>
                    {school.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`${ROUTE}/${school.id}`}
                    className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-gray-100"
                  >
                    Manage access →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-gray-600">
        <span>
          Page {meta.page} of {Math.max(1, meta.totalPages)} · {meta.total} total
        </span>
        <div className="flex gap-3">
          {meta.page > 1 && (
            <Link href={buildHref({ page: meta.page - 1 })} className="hover:text-gray-900">
              ← Prev
            </Link>
          )}
          {meta.page < meta.totalPages && (
            <Link href={buildHref({ page: meta.page + 1 })} className="hover:text-gray-900">
              Next →
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
