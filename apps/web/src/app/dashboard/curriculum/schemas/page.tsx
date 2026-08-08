import Link from 'next/link';
import { redirect } from 'next/navigation';
import { apiListCurriculumSchemas } from '@/lib/api-client';
import { canRoleAccess } from '@/lib/nav';
import { getAccessToken, requireUser } from '@/lib/session';
import { PageHeader } from '@/components/ui/page-header';
import { SchemaForm } from './_components/schema-form';
import { SchemaActions } from './_components/schema-actions';

export default async function CurriculumSchemasPage() {
  const user = await requireUser(); if (!canRoleAccess(user.role, '/dashboard/curriculum')) redirect('/dashboard');
  const schemas = await apiListCurriculumSchemas(getAccessToken() ?? '');
  return <div className="grid gap-6">
    <Link href="/dashboard/curriculum" className="text-sm text-gray-600 hover:text-gray-900">← Curriculum</Link>
    <PageHeader title="Curriculum schemas" description="Reusable names and rules for every level below grade and subject." />
    <SchemaForm />
    <div className="grid gap-4">
      {schemas.map((schema) => <section key={schema.id} className="rounded-lg border bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-4"><div><h2 className="font-medium">{schema.name}</h2><p className="font-mono text-xs text-gray-500">{schema.code}</p>{schema.description && <p className="mt-2 text-sm text-gray-600">{schema.description}</p>}</div><span className="text-sm text-gray-500">{schema.curriculumCount} curricula</span></div><ol className="mt-4 flex flex-wrap gap-2">{schema.levels.map((level) => <li key={level.id} className="rounded bg-gray-100 px-3 py-1 text-sm">{level.depth}. {level.name}{level.canHoldContent ? ' · videos' : ''}</li>)}</ol><SchemaActions schema={schema} /></section>)}
    </div>
  </div>;
}
