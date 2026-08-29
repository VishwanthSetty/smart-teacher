import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Atom, BookOpen, Calculator, FlaskConical, Languages, Palette, ScrollText } from 'lucide-react';
import { ContentAudience, Role, type Curriculum } from '@smart-teacher/shared-types';
import { apiListMyCurricula } from '@/lib/api-client';
import { canRoleAccess } from '@/lib/nav';
import { getAccessToken, requireUser } from '@/lib/session';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';

const ROUTE = '/dashboard/videos';
const SUBJECT_ICONS = [Calculator, FlaskConical, Languages, ScrollText, Palette, Atom];

interface GradeGroup { id: string; name: string; curricula: Curriculum[] }

function groupByGrade(curricula: Curriculum[]): GradeGroup[] {
  const groups = new Map<string, GradeGroup>();
  for (const curriculum of curricula) {
    const group = groups.get(curriculum.gradeLevelId) ?? { id: curriculum.gradeLevelId, name: curriculum.gradeLevelName, curricula: [] };
    group.curricula.push(curriculum); groups.set(curriculum.gradeLevelId, group);
  }
  return [...groups.values()];
}

export default async function VideosPage({ searchParams }: { searchParams: { gradeLevelId?: string; audience?: string } }) {
  const user = await requireUser();
  if (!canRoleAccess(user.role, ROUTE)) redirect('/dashboard/forbidden');
  const isStudent = user.role === Role.STUDENT;
  const audience = !isStudent && searchParams.audience === ContentAudience.TEACHER ? ContentAudience.TEACHER : ContentAudience.STUDENT;
  const curricula = await apiListMyCurricula(getAccessToken() ?? '', audience);
  const grades = groupByGrade(curricula);
  const selectedGrade = grades.find((grade) => grade.id === searchParams.gradeLevelId) ?? grades[0];
  const visibleCurricula = selectedGrade?.curricula ?? [];
  const audienceQuery = `audience=${audience}`;
  return <div className="flex flex-col gap-6"><PageHeader title={selectedGrade?.name ?? (isStudent ? 'My Subjects' : 'Library')} description={user.school?.name ?? undefined} />{!isStudent ? <div><span className="mb-2 block text-xs font-medium text-ink-muted">Audience</span><nav className="inline-flex rounded-lg bg-slate-100 p-1" aria-label="Content audience"><Link href={`${ROUTE}?audience=${ContentAudience.STUDENT}`} className={`rounded-md px-4 py-2 text-sm font-medium ${audience === ContentAudience.STUDENT ? 'bg-white text-brand-navy shadow-sm' : 'text-ink-muted'}`}>Students</Link><Link href={`${ROUTE}?audience=${ContentAudience.TEACHER}`} className={`rounded-md px-4 py-2 text-sm font-medium ${audience === ContentAudience.TEACHER ? 'bg-white text-brand-navy shadow-sm' : 'text-ink-muted'}`}>Teachers</Link></nav></div> : null}{grades.length > 0 ? <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="Grade levels">{grades.map((grade) => <Link key={grade.id} href={`${ROUTE}?${audienceQuery}&gradeLevelId=${encodeURIComponent(grade.id)}`} className={`whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium ${selectedGrade?.id === grade.id ? 'border-brand-navy bg-brand-navy text-white' : 'border-surface-border bg-white text-ink-muted hover:border-brand-soft'}`}>{grade.name}</Link>)}</nav> : null}{curricula.length === 0 ? <EmptyState icon={<BookOpen className="h-8 w-8" />} title="No curricula yet" description="No published curriculum is available to you. Ask your school administrator once your class is set up." /> : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{visibleCurricula.map((curriculum, index) => { const Icon = SUBJECT_ICONS[index % SUBJECT_ICONS.length]; return <Link key={curriculum.id} href={`${ROUTE}/${curriculum.id}?${audienceQuery}`} className="group relative flex min-h-40 flex-col overflow-hidden rounded-card border border-surface-border bg-white p-5 shadow-card transition hover:-translate-y-0.5 hover:border-brand-soft hover:shadow-overlay"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-tint text-brand-blue"><Icon className="h-5 w-5" /></span><h2 className="mt-4 text-base font-medium text-ink">{curriculum.subjectName}</h2><p className="mt-1 text-sm text-ink-muted">{curriculum.videoCount} videos · {curriculum.documentCount} documents</p><span className="absolute inset-x-0 bottom-0 h-1 bg-brand-soft transition-all group-hover:h-1.5" /></Link>; })}</div>}</div>;
}
