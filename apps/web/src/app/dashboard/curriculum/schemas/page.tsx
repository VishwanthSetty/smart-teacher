import Link from 'next/link';
import { redirect } from 'next/navigation';
import { apiListCurriculumSchemas } from '@/lib/api-client';
import { canRoleAccess } from '@/lib/nav';
import { getAccessToken, requireUser } from '@/lib/session';
import { PageHeader } from '@/components/ui/page-header';
import { SchemaForm } from './_components/schema-form';
import { SchemaActions } from './_components/schema-actions';

export default async function CurriculumSchemasPage() {
  const user = await requireUser();
  if (!canRoleAccess(user.role, '/dashboard/curriculum')) redirect('/dashboard');
  const schemas = await apiListCurriculumSchemas(getAccessToken() ?? '');

  return (
    <div className="grid gap-6">
      <Link href="/dashboard/curriculum" className="text-sm font-medium text-brand-blue hover:text-brand-navy">← Curriculum</Link>
      <PageHeader title="Curriculum schemas" description="Reusable names and rules for every level below grade and subject." />
      <SchemaForm />
      <div className="grid gap-4">
        {schemas.map((schema) => (
          <section key={schema.id} className="rounded-card border border-surface-border bg-white p-5 shadow-card transition hover:border-brand-soft">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-medium text-ink">{schema.name}</h2>
                <p className="font-mono text-xs text-ink-muted">{schema.code}</p>
                {schema.description ? <p className="mt-2 text-sm text-ink-muted">{schema.description}</p> : null}
              </div>
              <span className="rounded-full bg-brand-tint px-2 py-1 text-xs font-medium text-brand-navy">{schema.curriculumCount} curricula</span>
            </div>
            <ol className="mt-4 flex flex-wrap gap-2">
              {schema.levels.map((level) => (
                <li key={level.id} className="rounded-full bg-surface-low px-3 py-1 text-sm text-ink">
                  {level.depth}. {level.name}{level.canHoldContent ? ' · content' : ''}
                </li>
              ))}
            </ol>
            <SchemaActions schema={schema} />
          </section>
        ))}
      </div>
    </div>
  );
}
