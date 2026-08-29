import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BookOpen, Plus, Users } from 'lucide-react';
import { Role, type TeacherAssignment } from '@smart-teacher/shared-types';
import { canRoleAccess } from '@/lib/nav';
import { getAccessToken, requireUser } from '@/lib/session';
import { apiListGradeLevels, apiListSections, apiListTeacherAssignments } from '@/lib/api-client';
import { CreateSectionForm } from '@/components/sections/create-section-form';
import { Avatar } from '@/components/ui/avatar';
import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { Table, TableCell, TableHead, TableHeaderCell, TableRow, TableShell } from '@/components/ui/table';

const ROUTE = '/dashboard/classes';

function AssignmentChips({ assignments, showSubject = false }: { assignments: TeacherAssignment[]; showSubject?: boolean }) {
  if (assignments.length === 0) return <span className="text-ink-muted">—</span>;
  return <div className="flex flex-wrap gap-2">{assignments.slice(0, 3).map((assignment) => <span key={assignment.id} className="inline-flex items-center gap-2 rounded-full bg-brand-tint py-1 pl-1 pr-3 text-xs font-medium text-brand-navy"><Avatar name={assignment.teacherName} className="h-6 w-6 text-[9px]" /><span>{assignment.teacherName}{showSubject ? <small className="ml-1 font-normal text-ink-muted">· {assignment.subjectName}</small> : null}</span></span>)}{assignments.length > 3 ? <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-ink-muted">+{assignments.length - 3}</span> : null}</div>;
}

export default async function ClassesPage(): Promise<React.ReactElement> {
  const user = await requireUser();
  if (!canRoleAccess(user.role, ROUTE)) redirect('/dashboard/forbidden');
  const isAdmin = user.role === Role.SCHOOL_ADMIN;
  const accessToken = getAccessToken() ?? '';
  const [sections, assignments, gradeLevels] = await Promise.all([apiListSections(accessToken), apiListTeacherAssignments(accessToken, {}), isAdmin ? apiListGradeLevels(accessToken) : Promise.resolve([])]);
  const assignmentsBySection = new Map<string, TeacherAssignment[]>();
  for (const assignment of assignments) if (assignment.sectionId) assignmentsBySection.set(assignment.sectionId, [...(assignmentsBySection.get(assignment.sectionId) ?? []), assignment]);
  const schoolWideAssignments = assignments.filter((assignment) => assignment.sectionId === null);
  return <div className="flex flex-col gap-6"><PageHeader title="Classes & Sections" description="View class sizes and the teachers assigned to each section." action={isAdmin ? <ButtonLink href="#create-section"><Plus className="h-4 w-4" /> New section</ButtonLink> : undefined} />{isAdmin ? <CreateSectionForm gradeLevels={gradeLevels} /> : null}{sections.length === 0 ? <EmptyState icon={<BookOpen className="h-8 w-8" />} title="No classes yet" description="Create a section to start placing students and assigning teachers." action={isAdmin ? <ButtonLink href="#create-section">Create a section</ButtonLink> : undefined} /> : <><TableShell className="hidden md:block"><Table><TableHead><tr><TableHeaderCell>Class</TableHeaderCell><TableHeaderCell>Grade level</TableHeaderCell><TableHeaderCell>Students</TableHeaderCell><TableHeaderCell>Teachers</TableHeaderCell></tr></TableHead><tbody>{sections.map((section) => <TableRow key={section.id}><TableCell className="font-medium">{section.label}</TableCell><TableCell className="text-ink-muted">{section.gradeLevelName}</TableCell><TableCell><Link href={`/dashboard/students?sectionId=${encodeURIComponent(section.id)}`} className={`inline-flex items-center gap-2 font-medium ${section.studentCount === 0 ? 'text-ink-muted' : 'text-brand-blue hover:text-brand-navy'}`}><Users className="h-4 w-4" />{section.studentCount}</Link></TableCell><TableCell><AssignmentChips assignments={assignmentsBySection.get(section.id) ?? []} /></TableCell></TableRow>)}</tbody></Table></TableShell><div className="grid gap-3 md:hidden">{sections.map((section) => <Card key={section.id} className="p-4"><div className="flex items-start justify-between gap-4"><div><h2 className="font-semibold text-ink">{section.label}</h2><p className="text-sm text-ink-muted">{section.gradeLevelName}</p></div><Link href={`/dashboard/students?sectionId=${encodeURIComponent(section.id)}`} className="inline-flex items-center gap-1 text-sm font-medium text-brand-blue"><Users className="h-4 w-4" /> {section.studentCount}</Link></div><div className="mt-4"><AssignmentChips assignments={assignmentsBySection.get(section.id) ?? []} /></div></Card>)}</div></>}{schoolWideAssignments.length > 0 ? <section className="space-y-3"><div><h2 className="text-lg font-medium text-ink">School-wide teaching assignments</h2><p className="text-sm text-ink-muted">Assignments not yet linked to a specific section.</p></div><Card className="p-5"><AssignmentChips assignments={schoolWideAssignments} showSubject /></Card></section> : null}</div>;
}
