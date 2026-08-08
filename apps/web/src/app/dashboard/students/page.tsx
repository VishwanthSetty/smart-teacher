import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Role, UserStatus, type Student } from '@smart-teacher/shared-types';
import { canRoleAccess } from '@/lib/nav';
import { getAccessToken, requireUser } from '@/lib/session';
import { apiListSections, apiListStudents } from '@/lib/api-client';
import { PageHeader } from '@/components/ui/page-header';
import { CreateStudentForm } from './_components/create-student-form';
import { StudentRowActions } from './_components/student-row-actions';
import { BulkImportPanel } from './_components/bulk-import-panel';

const ROUTE = '/dashboard/students';
const PAGE_SIZE = 20;

const STATUS_LABELS: Record<Student['status'], string> = {
  PENDING: 'Pending',
  ACTIVE: 'Active',
  DISABLED: 'Disabled',
};

function parseStatus(value?: string): UserStatus | undefined {
  return value === UserStatus.PENDING || value === UserStatus.ACTIVE || value === UserStatus.DISABLED
    ? value
    : undefined;
}

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: { search?: string; sectionId?: string; status?: string; page?: string };
}) {
  const user = await requireUser();
  // The API is the real boundary; this only stops a user landing on a page whose data
  // calls would 403 (mirrors the guard in dashboard/schools/page.tsx).
  if (!canRoleAccess(user.role, ROUTE)) {
    redirect('/dashboard');
  }
  const isAdmin = user.role === Role.SCHOOL_ADMIN;
  const accessToken = getAccessToken() ?? '';

  const search = searchParams.search?.trim() || undefined;
  const sectionId = searchParams.sectionId || undefined;
  const status = parseStatus(searchParams.status);
  const page = Math.max(1, Number(searchParams.page) || 1);

  const [{ data: students, meta }, sections] = await Promise.all([
    apiListStudents(accessToken, { page, limit: PAGE_SIZE, search, sectionId, status }),
    apiListSections(accessToken),
  ]);

  const buildHref = (overrides: {
    status?: UserStatus | '';
    sectionId?: string;
    search?: string;
    page?: number;
  }) => {
    const params = new URLSearchParams();
    const nextStatus = 'status' in overrides ? overrides.status : status;
    const nextSectionId = 'sectionId' in overrides ? overrides.sectionId : sectionId;
    const nextSearch = 'search' in overrides ? overrides.search : search;
    const nextPage = overrides.page ?? 1;
    if (nextStatus) params.set('status', nextStatus);
    if (nextSectionId) params.set('sectionId', nextSectionId);
    if (nextSearch) params.set('search', nextSearch);
    if (nextPage > 1) params.set('page', String(nextPage));
    const qs = params.toString();
    return qs ? `/dashboard/students?${qs}` : '/dashboard/students';
  };

  const filterHref = (value?: UserStatus) => buildHref({ status: value ?? '' });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Students" description="Onboard students and manage their class placement." />

      {isAdmin && (
        <>
          <BulkImportPanel />

          <CreateStudentForm sections={sections} />
        </>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-500">Filter:</span>
          <Link href={filterHref()} className={!status ? 'font-medium' : 'text-gray-600 hover:text-gray-900'}>
            All
          </Link>
          <Link
            href={filterHref(UserStatus.ACTIVE)}
            className={status === UserStatus.ACTIVE ? 'font-medium' : 'text-gray-600 hover:text-gray-900'}
          >
            Active
          </Link>
          <Link
            href={filterHref(UserStatus.PENDING)}
            className={status === UserStatus.PENDING ? 'font-medium' : 'text-gray-600 hover:text-gray-900'}
          >
            Pending
          </Link>
          <Link
            href={filterHref(UserStatus.DISABLED)}
            className={status === UserStatus.DISABLED ? 'font-medium' : 'text-gray-600 hover:text-gray-900'}
          >
            Disabled
          </Link>
        </div>

        <form className="flex flex-wrap items-center gap-2">
          {status && <input type="hidden" name="status" value={status} />}
          <select
            name="sectionId"
            defaultValue={sectionId ?? ''}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-gray-500 focus:outline-none"
          >
            <option value="">All sections</option>
            {sections.map((section) => (
              <option key={section.id} value={section.id}>
                {section.label}
              </option>
            ))}
          </select>
          <input
            type="search"
            name="search"
            defaultValue={search ?? ''}
            placeholder="Search by name, email, or roll number"
            className="w-72 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-gray-500 focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-gray-100"
          >
            Filter
          </button>
          {(search || sectionId) && (
            <Link
              href={buildHref({ status, search: '', sectionId: '' })}
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Clear
            </Link>
          )}
        </form>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3 font-medium">Roll no</th>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Class / Section</th>
              <th className="px-4 py-3 font-medium">Status</th>
              {isAdmin && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody>
            {students.length === 0 && (
              <tr>
                <td colSpan={isAdmin ? 6 : 5} className="px-4 py-6 text-center text-gray-500">
                  {search || sectionId || status ? 'No students match this filter.' : 'No students yet.'}
                </td>
              </tr>
            )}
            {students.map((student) => (
              <tr key={student.id} className="border-b border-gray-100 last:border-b-0">
                <td className="px-4 py-3 text-gray-600">{student.enrollment?.rollNumber ?? '—'}</td>
                <td className="px-4 py-3 font-medium">{student.name}</td>
                <td className="px-4 py-3 text-gray-600">{student.email}</td>
                <td className="px-4 py-3 text-gray-600">
                  {student.enrollment ? `${student.enrollment.gradeLevelName} - ${student.enrollment.sectionName}` : '—'}
                </td>
                <td className="px-4 py-3 text-gray-600">{STATUS_LABELS[student.status]}</td>
                {isAdmin && (
                  <td className="px-4 py-3 text-right">
                    <StudentRowActions student={student} sections={sections} />
                  </td>
                )}
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
