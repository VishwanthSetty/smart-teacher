import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ListTree } from 'lucide-react';
import {
  apiListActiveSubjects,
  apiListAdminGradeLevels,
  apiListCurricula,
  apiListCurriculumSchemas,
} from '@/lib/api-client';
import { canRoleAccess } from '@/lib/nav';
import { getAccessToken, requireUser } from '@/lib/session';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { CreateCurriculumForm } from './_components/create-curriculum-form';
import { StatusBadge } from '@/components/ui/badge';
import { Table, TableCell, TableHead, TableHeaderCell, TableRow, TableShell } from '@/components/ui/table';

const ROUTE = '/dashboard/curriculum';

export default async function CurriculumPage() {
  const user = await requireUser();
  if (!canRoleAccess(user.role, ROUTE)) redirect('/dashboard');
  const accessToken = getAccessToken() ?? '';

  const [curricula, gradeLevels, subjects, schemas] = await Promise.all([
    // A high limit rather than pagination: a curriculum is one (grade, subject) pair, so
    // the whole catalogue fits on one screen for any realistic platform.
    apiListCurricula(accessToken, { limit: 200 }),
    apiListAdminGradeLevels(accessToken),
    // Active subjects only: the API 409s on a curriculum naming a retired one.
    apiListActiveSubjects(accessToken),
    apiListCurriculumSchemas(accessToken),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Curriculum"
        description="One curriculum per grade level, subject, and audience. Its tree is what schools browse, and what an entitlement grants."
      />

      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-muted">
          Level names and depth come from a schema, so the structure can differ from grade to grade
          and subject to subject.
        </p>
        <Link href={`${ROUTE}/schemas`} className="text-sm font-medium text-brand-blue hover:text-brand-navy">
          Manage level schemas →
        </Link>
      </div>

      <CreateCurriculumForm gradeLevels={gradeLevels} subjects={subjects} schemas={schemas} />

      {curricula.data.length === 0 ? (
        <EmptyState
          icon={<ListTree className="h-8 w-8" aria-hidden="true" />}
          title="No curricula yet"
          description="Create one above. Until a curriculum exists for a grade level and subject, no school can be granted it and no video can be filed under it."
        />
      ) : (
        <TableShell>
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>Grade level</TableHeaderCell>
                <TableHeaderCell>Subject</TableHeaderCell>
                <TableHeaderCell>Audience</TableHeaderCell>
                <TableHeaderCell>Structure</TableHeaderCell>
                <TableHeaderCell>Nodes</TableHeaderCell>
                <TableHeaderCell>Videos</TableHeaderCell>
                <TableHeaderCell>Documents</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
              </tr>
            </TableHead>
            <tbody>
              {curricula.data.map((curriculum) => (
                <TableRow key={curriculum.id}>
                  <TableCell>
                    <Link className="font-medium hover:text-brand-blue" href={`${ROUTE}/${curriculum.id}`}>
                      {curriculum.gradeLevelName}
                    </Link>
                  </TableCell>
                  <TableCell>{curriculum.subjectName}</TableCell>
                  <TableCell>{curriculum.audience === 'TEACHER' ? 'Teachers' : 'Students'}</TableCell>
                  <TableCell className="text-ink-muted">{curriculum.schemaName}</TableCell>
                  <TableCell>{curriculum.nodeCount}</TableCell>
                  <TableCell>{curriculum.videoCount}</TableCell>
                  <TableCell>{curriculum.documentCount}</TableCell>
                  <TableCell><StatusBadge status={curriculum.status} /></TableCell>
                </TableRow>
              ))}
            </tbody>
          </Table>
        </TableShell>
      )}
    </div>
  );
}
