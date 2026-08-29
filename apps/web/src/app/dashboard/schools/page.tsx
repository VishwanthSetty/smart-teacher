import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Role, SchoolStatus } from '@smart-teacher/shared-types';
import { apiListSchools } from '@/lib/api-client';
import { getAccessToken, requireUser } from '@/lib/session';
import { PageHeader } from '@/components/ui/page-header';
import { ButtonLink } from '@/components/ui/button';
import { FilterTabs } from '@/components/ui/filter-tabs';
import { Pagination } from '@/components/ui/pagination';
import { SearchField } from '@/components/ui/search-field';
import { StatusBadge } from '@/components/ui/badge';
import { Table, TableCell, TableHead, TableHeaderCell, TableRow, TableShell } from '@/components/ui/table';
import { CreateSchoolForm } from './_components/create-school-form';
import { SchoolRowActions } from './_components/school-row-actions';

const PAGE_SIZE = 20;

function parseStatus(value?: string): SchoolStatus | undefined {
  return value === SchoolStatus.ACTIVE || value === SchoolStatus.SUSPENDED ? value : undefined;
}

export default async function SchoolsPage({
  searchParams,
}: {
  searchParams: { status?: string; page?: string; search?: string };
}) {
  const user = await requireUser();
  if (user.role !== Role.SUPER_ADMIN) redirect('/dashboard');

  const accessToken = getAccessToken() ?? '';
  const status = parseStatus(searchParams.status);
  const search = searchParams.search?.trim() || undefined;
  const page = Math.max(1, Number(searchParams.page) || 1);
  const { data: schools, meta } = await apiListSchools(accessToken, { page, limit: PAGE_SIZE, status, search });

  const buildHref = (overrides: { status?: SchoolStatus; search?: string; page?: number }) => {
    const params = new URLSearchParams();
    const nextStatus = 'status' in overrides ? overrides.status : status;
    const nextSearch = 'search' in overrides ? overrides.search : search;
    const nextPage = overrides.page ?? 1;
    if (nextStatus) params.set('status', nextStatus);
    if (nextSearch) params.set('search', nextSearch);
    if (nextPage > 1) params.set('page', String(nextPage));
    const query = params.toString();
    return query ? `/dashboard/schools?${query}` : '/dashboard/schools';
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Schools"
        description="Provision and manage tenant schools."
        action={<ButtonLink href="#create-school"><Plus className="h-4 w-4" /> New school</ButtonLink>}
      />
      <CreateSchoolForm />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <FilterTabs tabs={[
          { label: 'All', href: buildHref({ status: undefined }), isActive: !status },
          { label: 'Active', href: buildHref({ status: SchoolStatus.ACTIVE }), isActive: status === SchoolStatus.ACTIVE },
          { label: 'Suspended', href: buildHref({ status: SchoolStatus.SUSPENDED }), isActive: status === SchoolStatus.SUSPENDED },
        ]} />
        <form className="flex w-full items-center gap-2 sm:w-auto">
          {status ? <input type="hidden" name="status" value={status} /> : null}
          <SearchField defaultValue={search} placeholder="Search by name, slug, or admin email" className="w-full sm:w-80" />
          {search ? <Link href={buildHref({ status, search: undefined })} className="text-sm font-medium text-brand-blue">Clear</Link> : null}
        </form>
      </div>

      <TableShell>
        <Table>
          <TableHead>
            <tr>
              <TableHeaderCell>Name</TableHeaderCell>
              <TableHeaderCell>Slug</TableHeaderCell>
              <TableHeaderCell>Admin email</TableHeaderCell>
              <TableHeaderCell>Academic year</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell>Plan</TableHeaderCell>
              <TableHeaderCell />
            </tr>
          </TableHead>
          <tbody>
            {schools.map((school) => (
              <TableRow key={school.id} className={school.status === SchoolStatus.SUSPENDED ? 'opacity-70' : undefined}>
                <TableCell className="font-medium">{school.name}</TableCell>
                <TableCell className="font-mono text-xs text-ink-muted">{school.slug}</TableCell>
                <TableCell className="text-ink-muted">{school.adminEmail ?? '—'}</TableCell>
                <TableCell>{school.academicYear}</TableCell>
                <TableCell><StatusBadge status={school.status} /></TableCell>
                <TableCell><span className="rounded-full bg-brand-tint px-2 py-0.5 text-xs font-medium text-brand-navy">{school.plan}</span></TableCell>
                <TableCell className="text-right"><SchoolRowActions id={school.id} name={school.name} status={school.status} /></TableCell>
              </TableRow>
            ))}
            {schools.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="h-40 text-center text-ink-muted">{search || status ? 'No schools match this search.' : 'No schools yet.'}</TableCell></TableRow>
            ) : null}
          </tbody>
        </Table>
      </TableShell>
      <Pagination
        page={meta.page}
        totalPages={meta.totalPages}
        total={meta.total}
        previousHref={meta.page > 1 ? buildHref({ page: meta.page - 1 }) : undefined}
        nextHref={meta.page < meta.totalPages ? buildHref({ page: meta.page + 1 }) : undefined}
      />
    </div>
  );
}
