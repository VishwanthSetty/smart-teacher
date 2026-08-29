import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { BookOpen, MoreHorizontal } from 'lucide-react';
import { Role, type Section } from '@smart-teacher/shared-types';
import { canRoleAccess } from '@/lib/nav';
import { getAccessToken, requireUser } from '@/lib/session';
import { apiGetUser, apiListActiveSubjects, apiListSections, apiListTeacherAssignments, apiListGradeLevels, ApiError } from '@/lib/api-client';
import { Avatar } from '@/components/ui/avatar';
import { StatusBadge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { CreateAssignmentForm } from '../_components/create-assignment-form';
import { AssignmentRowActions } from '../_components/assignment-row-actions';

const ROUTE = '/dashboard/teachers';

function formatDate(value: string | null): string {
  return value ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value)) : '—';
}

export default async function TeacherDetailPage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  if (!canRoleAccess(user.role, ROUTE)) redirect('/dashboard/forbidden');
  const accessToken = getAccessToken() ?? '';
  const teacher = await apiGetUser(accessToken, params.id).catch((error) => { if (error instanceof ApiError && error.status === 404) return null; throw error; });
  if (!teacher || teacher.role !== Role.TEACHER) notFound();
  const [assignments, sections, subjects, gradeLevels] = await Promise.all([apiListTeacherAssignments(accessToken, { teacherId: teacher.id }), apiListSections(accessToken), apiListActiveSubjects(accessToken), apiListGradeLevels(accessToken)]);
  const sectionsById = new Map<string, Section>(sections.map((section) => [section.id, section]));
  const classIds = new Set(assignments.map((assignment) => assignment.sectionId).filter((id): id is string => Boolean(id)));
  const subjectIds = new Set(assignments.map((assignment) => assignment.subjectId));
  const studentsReached = [...classIds].reduce((total, id) => total + (sectionsById.get(id)?.studentCount ?? 0), 0);

  return (
    <div className="flex flex-col gap-6">
      <Link href={ROUTE} className="w-fit text-sm font-medium text-ink-muted hover:text-brand-blue">← Teachers</Link>
      <div className="flex flex-wrap items-center gap-4">
        <Avatar name={teacher.name} className="h-14 w-14 text-base" />
        <div className="min-w-0 flex-1"><h1 className="text-2xl font-semibold text-ink">{teacher.name}</h1><p className="mt-1 truncate text-sm text-ink-muted">{teacher.email}</p></div>
        <StatusBadge status={teacher.status} />
        <button type="button" className="rounded-lg border border-surface-border p-2.5 text-ink-muted" aria-label="More account actions"><MoreHorizontal className="h-5 w-5" /></button>
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-3">
        <Card id="assignments" className="overflow-hidden lg:col-span-2">
          <div className="border-b border-surface-border px-6 py-4"><h2 className="text-lg font-medium text-ink">Teaching assignments</h2><p className="mt-1 text-sm text-ink-muted">Classes and subjects this teacher can reach.</p></div>
          {assignments.length === 0 ? <div className="p-6"><EmptyState icon={<BookOpen className="h-8 w-8" />} title="No assignments yet" description="Assign this teacher to a section and subject using the form." /></div> : <div className="divide-y divide-surface-border">{assignments.map((assignment) => <div key={assignment.id} className="flex flex-wrap items-center gap-4 px-6 py-4"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="font-medium text-ink">{assignment.sectionLabel ?? assignment.gradeLevelName ?? 'School-wide'}</span>{!assignment.sectionId ? <span className="rounded-full bg-brand-tint px-2 py-0.5 text-xs font-medium text-brand-navy">School-wide</span> : null}<span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-ink-muted">Students</span></div><p className="mt-1 text-sm text-ink-muted">{assignment.subjectName}</p></div><AssignmentRowActions assignmentId={assignment.id} /></div>)}</div>}
        </Card>
        <div className="grid gap-4">
          <Card className="p-5"><h2 className="text-base font-semibold text-ink">Add an assignment</h2><div className="mt-4"><CreateAssignmentForm teacherId={teacher.id} sections={sections} subjects={subjects} gradeLevels={gradeLevels} /></div></Card>
          <Card className="p-5"><h2 className="text-base font-semibold text-ink">At a glance</h2><dl className="mt-3 divide-y divide-surface-border">{[['Classes', classIds.size], ['Subjects', subjectIds.size], ['Students reached', studentsReached]].map(([label, value]) => <div key={label} className="flex justify-between py-3 text-sm"><dt className="text-ink-muted">{label}</dt><dd className="font-semibold tabular-nums text-ink">{value}</dd></div>)}</dl></Card>
          <Card className="p-5"><h2 className="text-base font-semibold text-ink">Account</h2><dl className="mt-3 divide-y divide-surface-border"><div className="flex justify-between py-3 text-sm"><dt className="text-ink-muted">Invited</dt><dd className="text-ink">{formatDate(teacher.createdAt)}</dd></div><div className="flex justify-between py-3 text-sm"><dt className="text-ink-muted">Activated</dt><dd className="text-ink">{formatDate(teacher.activatedAt)}</dd></div><div className="flex justify-between py-3 text-sm"><dt className="text-ink-muted">Last sign-in</dt><dd className="text-ink">Not tracked</dd></div></dl></Card>
        </div>
      </div>
    </div>
  );
}
