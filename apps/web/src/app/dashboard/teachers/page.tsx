import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BookOpen, Plus, Upload, Users } from 'lucide-react';
import { Role, UserStatus, type TeacherAssignment } from '@smart-teacher/shared-types';
import { canRoleAccess } from '@/lib/nav';
import { getAccessToken, requireUser } from '@/lib/session';
import { apiListActiveSubjects, apiListGradeLevels, apiListTeacherAssignments, apiListUsers } from '@/lib/api-client';
import { Avatar } from '@/components/ui/avatar';
import { ButtonLink } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { FilterTabs } from '@/components/ui/filter-tabs';
import { PageHeader } from '@/components/ui/page-header';
import { Pagination } from '@/components/ui/pagination';
import { SearchField } from '@/components/ui/search-field';
import { StatusBadge } from '@/components/ui/badge';
import { Table, TableCell, TableHead, TableHeaderCell, TableRow, TableShell } from '@/components/ui/table';
import { BulkImportPanel } from './_components/bulk-import-panel';
import { CreateTeacherForm } from './_components/create-teacher-form';
import { TeacherRowActions } from './_components/teacher-row-actions';

const ROUTE = '/dashboard/teachers';
const PAGE_SIZE = 20;

function parseStatus(value?: string): UserStatus | undefined {
  return Object.values(UserStatus).find((status) => status === value);
}

function hrefFor(current: URLSearchParams, values: Record<string, string | number | undefined>): string {
  const next = new URLSearchParams(current);
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === '') next.delete(key);
    else next.set(key, String(value));
  }
  const query = next.toString();
  return query ? `${ROUTE}?${query}` : ROUTE;
}

function TeacherSubjects({ assignments }: { assignments: TeacherAssignment[] }) {
  const names = [...new Set(assignments.map((assignment) => assignment.subjectName))];
  if (names.length === 0) return <span className="text-ink-muted">—</span>;
  return <div className="flex flex-wrap gap-1.5">{names.slice(0, 2).map((name) => <span key={name} className="rounded-full bg-brand-tint px-2.5 py-1 text-xs font-medium text-brand-navy">{name}</span>)}{names.length > 2 ? <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-ink-muted">+{names.length - 2}</span> : null}</div>;
}

export default async function TeachersPage({ searchParams }: { searchParams: { status?: string; subjectId?: string; search?: string; page?: string } }) {
  const user = await requireUser();
  if (!canRoleAccess(user.role, ROUTE)) redirect('/dashboard/forbidden');
  const isAdmin = user.role === Role.SCHOOL_ADMIN;
  const accessToken = getAccessToken() ?? '';
  const [users, assignments, subjects, gradeLevels] = await Promise.all([
    apiListUsers(accessToken),
    apiListTeacherAssignments(accessToken, {}),
    isAdmin ? apiListActiveSubjects(accessToken) : Promise.resolve([]),
    isAdmin ? apiListGradeLevels(accessToken) : Promise.resolve([]),
  ]);
  const assignmentsByTeacher = new Map<string, TeacherAssignment[]>();
  for (const assignment of assignments) assignmentsByTeacher.set(assignment.teacherId, [...(assignmentsByTeacher.get(assignment.teacherId) ?? []), assignment]);
  const status = parseStatus(searchParams.status);
  const search = searchParams.search?.trim().toLowerCase() ?? '';
  const subjectId = searchParams.subjectId ?? '';
  const filtered = users.filter((candidate) => {
    if (candidate.role !== Role.TEACHER) return false;
    if (status && candidate.status !== status) return false;
    if (search && !`${candidate.name} ${candidate.email}`.toLowerCase().includes(search)) return false;
    if (subjectId && !(assignmentsByTeacher.get(candidate.id) ?? []).some((item) => item.subjectId === subjectId)) return false;
    return true;
  });
  const page = Math.max(1, Number(searchParams.page) || 1);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const current = new URLSearchParams();
  if (status) current.set('status', status);
  if (subjectId) current.set('subjectId', subjectId);
  if (search) current.set('search', searchParams.search?.trim() ?? '');

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Teachers" description="Onboard teaching staff one at a time or in bulk, and assign the subjects they teach." action={isAdmin ? <div className="flex gap-2"><ButtonLink href="#import-teachers" variant="secondary"><Upload className="h-4 w-4" /> Import CSV</ButtonLink><ButtonLink href="#add-teacher"><Plus className="h-4 w-4" /> Add teacher</ButtonLink></div> : undefined} />
      {isAdmin ? <div className="grid gap-4 xl:grid-cols-2"><div id="add-teacher"><CreateTeacherForm subjects={subjects} gradeLevels={gradeLevels} /></div><div id="import-teachers"><BulkImportPanel /></div></div> : null}
      <div className="flex flex-col gap-4 rounded-card border border-surface-border bg-white p-4 shadow-card lg:flex-row lg:items-center lg:justify-between">
        <FilterTabs tabs={[{ label: 'All', href: hrefFor(current, { status: '', page: 1 }), isActive: !status }, ...Object.values(UserStatus).map((value) => ({ label: value[0] + value.slice(1).toLowerCase(), href: hrefFor(current, { status: value, page: 1 }), isActive: status === value }))]} />
        <form className="flex flex-1 flex-wrap items-center justify-end gap-2">
          {status ? <input type="hidden" name="status" value={status} /> : null}
          <select name="subjectId" defaultValue={subjectId} className="field w-auto min-w-44"><option value="">All subjects</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select>
          <SearchField defaultValue={searchParams.search} placeholder="Search teachers" className="w-full sm:w-64" />
          <button type="submit" className="h-10 rounded-lg bg-brand-blue px-4 text-sm font-medium text-white">Filter</button>
          {(search || subjectId) ? <Link href={hrefFor(current, { search: '', subjectId: '', page: 1 })} className="px-2 text-sm text-ink-muted hover:text-brand-blue">Clear</Link> : null}
        </form>
      </div>
      {visible.length === 0 ? <EmptyState icon={<Users className="h-8 w-8" />} title={filtered.length === 0 && (search || subjectId || status) ? 'No teachers match these filters' : 'No teachers yet'} description={filtered.length === 0 && (search || subjectId || status) ? 'Try a different status, subject, or search term.' : 'Add your teaching staff, then assign them to classes and subjects.'} action={isAdmin && !search && !subjectId && !status ? <ButtonLink href="#add-teacher">Add teacher</ButtonLink> : undefined} /> : <>
        <TableShell className="hidden md:block"><Table><TableHead><tr><TableHeaderCell>Name</TableHeaderCell><TableHeaderCell>Email</TableHeaderCell><TableHeaderCell>Subjects</TableHeaderCell><TableHeaderCell>Classes</TableHeaderCell><TableHeaderCell>Status</TableHeaderCell><TableHeaderCell className="w-16"><span className="sr-only">Actions</span></TableHeaderCell></tr></TableHead><tbody>{visible.map((teacher) => { const teacherAssignments = assignmentsByTeacher.get(teacher.id) ?? []; const classCount = new Set(teacherAssignments.map((item) => item.sectionId).filter(Boolean)).size; return <TableRow key={teacher.id}><TableCell><Link href={`${ROUTE}/${teacher.id}`} className="flex items-center gap-3 font-medium hover:text-brand-blue"><Avatar name={teacher.name} />{teacher.name}</Link></TableCell><TableCell className="text-ink-muted">{teacher.email}</TableCell><TableCell><TeacherSubjects assignments={teacherAssignments} /></TableCell><TableCell><span className="inline-flex items-center gap-2 text-ink-muted"><BookOpen className="h-4 w-4" />{classCount}</span></TableCell><TableCell><StatusBadge status={teacher.status} /></TableCell><TableCell><TeacherRowActions teacher={teacher} /></TableCell></TableRow>; })}</tbody></Table></TableShell>
        <div className="grid gap-3 md:hidden">{visible.map((teacher) => { const teacherAssignments = assignmentsByTeacher.get(teacher.id) ?? []; return <article key={teacher.id} className="rounded-card border border-surface-border bg-white p-4 shadow-card"><div className="flex items-start gap-3"><Avatar name={teacher.name} /><div className="min-w-0 flex-1"><Link href={`${ROUTE}/${teacher.id}`} className="font-semibold text-ink">{teacher.name}</Link><p className="truncate text-sm text-ink-muted">{teacher.email}</p></div><StatusBadge status={teacher.status} /><TeacherRowActions teacher={teacher} /></div><div className="mt-4"><TeacherSubjects assignments={teacherAssignments} /></div></article>; })}</div>
        <Pagination page={page} totalPages={totalPages} total={filtered.length} previousHref={page > 1 ? hrefFor(current, { page: page - 1 }) : undefined} nextHref={page < totalPages ? hrefFor(current, { page: page + 1 }) : undefined} />
      </>}
    </div>
  );
}
