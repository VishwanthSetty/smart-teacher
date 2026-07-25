import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Role, SchoolStatus } from '@smart-teacher/shared-types';
import { apiGetMe, apiListSchools } from '@/lib/api-client';
import { getAccessToken } from '@/lib/session';
import { CreateSchoolForm } from './_components/create-school-form';
import { SchoolRowActions } from './_components/school-row-actions';

const PAGE_SIZE = 20;

function parseStatus(value?: string): SchoolStatus | undefined {
  return value === SchoolStatus.ACTIVE || value === SchoolStatus.SUSPENDED ? value : undefined;
}

export default async function SchoolsPage({
  searchParams,
}: {
  searchParams: { status?: string; page?: string };
}) {
  const accessToken = getAccessToken();
  if (!accessToken) {
    redirect('/login');
  }

  const user = await apiGetMe(accessToken).catch(() => null);
  if (!user) {
    redirect('/login');
  }
  // Real authorization is enforced by the API; this guards the UI so non-super-admins
  // don't land on a page whose data calls would 403.
  if (user.role !== Role.SUPER_ADMIN) {
    redirect('/dashboard');
  }

  const status = parseStatus(searchParams.status);
  const page = Math.max(1, Number(searchParams.page) || 1);
  const { data: schools, meta } = await apiListSchools(accessToken, {
    page,
    limit: PAGE_SIZE,
    status,
  });

  const filterHref = (value?: SchoolStatus) =>
    value ? `/dashboard/schools?status=${value}` : '/dashboard/schools';

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 px-4 py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Schools</h1>
        <Link href="/dashboard" className="text-sm text-gray-600 hover:text-gray-900">
          ← Dashboard
        </Link>
      </div>

      <CreateSchoolForm />

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

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 text-gray-500">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Slug</th>
              <th className="px-4 py-3 font-medium">Academic year</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Plan</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {schools.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-gray-500">
                  No schools yet.
                </td>
              </tr>
            )}
            {schools.map((school) => (
              <tr key={school.id} className="border-b border-gray-100 last:border-0">
                <td className="px-4 py-3 font-medium">{school.name}</td>
                <td className="px-4 py-3 font-mono text-xs text-gray-600">{school.slug}</td>
                <td className="px-4 py-3">{school.academicYear}</td>
                <td className="px-4 py-3">
                  <span
                    className={
                      school.status === SchoolStatus.ACTIVE
                        ? 'text-green-700'
                        : 'text-red-700'
                    }
                  >
                    {school.status}
                  </span>
                </td>
                <td className="px-4 py-3">{school.plan}</td>
                <td className="px-4 py-3 text-right">
                  <SchoolRowActions id={school.id} status={school.status} />
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
            <Link
              href={`/dashboard/schools?${status ? `status=${status}&` : ''}page=${meta.page - 1}`}
              className="hover:text-gray-900"
            >
              ← Prev
            </Link>
          )}
          {meta.page < meta.totalPages && (
            <Link
              href={`/dashboard/schools?${status ? `status=${status}&` : ''}page=${meta.page + 1}`}
              className="hover:text-gray-900"
            >
              Next →
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}
