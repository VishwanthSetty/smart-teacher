'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { ContentAudience, Curriculum, Entitlement, GradeLevel, Subject } from '@smart-teacher/shared-types';
import { EmptyState } from '@/components/ui/empty-state';

function pairKey(gradeLevelId: string, subjectId: string): string {
  return `${gradeLevelId}:${subjectId}`;
}

// Grid checkbox that can render a third, "some but not all" visual state. `indeterminate`
// is a DOM property, not an HTML attribute, so it can only be set imperatively via a ref.
function GridCheckbox({
  checked,
  indeterminate = false,
  disabled = false,
  onChange,
  ariaLabel,
}: {
  checked: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  ariaLabel: string;
}) {
  return (
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      aria-label={ariaLabel}
      ref={(element) => {
        if (element) {
          element.indeterminate = indeterminate;
        }
      }}
      onChange={(event) => onChange(event.target.checked)}
      className="h-4 w-4 rounded border-surface-border text-brand-blue focus:ring-brand-blue disabled:opacity-30"
    />
  );
}

/**
 * The grid stays a grade x subject matrix because a curriculum *is* that pair — but a cell
 * is only checkable where a curriculum has actually been authored. Empty cells render
 * disabled rather than being hidden, so the gaps in the catalogue are visible to the
 * operator instead of silently absent.
 *
 * Selection is keyed by curriculum id, which is what the API grants against.
 */
export function EntitlementMatrix({
  schoolId,
  gradeLevels,
  subjects,
  curricula,
  granted,
  audience,
}: {
  schoolId: string;
  gradeLevels: GradeLevel[];
  subjects: Subject[];
  curricula: Curriculum[];
  granted: Entitlement[];
  audience: ContentAudience;
}) {
  const router = useRouter();

  const sortedGradeLevels = useMemo(() => [...gradeLevels].sort((a, b) => a.rank - b.rank), [gradeLevels]);
  const sortedSubjects = useMemo(() => [...subjects].sort((a, b) => a.name.localeCompare(b.name)), [subjects]);

  // Archived curricula cannot take new grants, so offering them would just be a slower
  // route to the API's 409.
  const curriculumByPair = useMemo(() => {
    const map = new Map<string, Curriculum>();
    for (const curriculum of curricula) {
      if (curriculum.status !== 'ARCHIVED') {
        map.set(pairKey(curriculum.gradeLevelId, curriculum.subjectId), curriculum);
      }
    }
    return map;
  }, [curricula]);

  const initialIds = useMemo(
    () => new Set(granted.filter((entitlement) => entitlement.audience === audience).map((entitlement) => entitlement.curriculumId)),
    [granted, audience],
  );

  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialIds));
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Re-seed after a save: the parent server component re-renders with the post-save
  // `granted` list (via router.refresh()), so local state is resynced to what is actually
  // persisted rather than drifting from it.
  useEffect(() => {
    setSelected(new Set(initialIds));
  }, [initialIds]);

  // Every curriculum the grid can actually offer. The diff below is scoped to these, so a
  // grant the grid cannot show — one on a retired subject — is never marked for revoke.
  const grantableIds = useMemo(
    () =>
      sortedGradeLevels.flatMap((gradeLevel) =>
        sortedSubjects
          .map((subject) => curriculumByPair.get(pairKey(gradeLevel.id, subject.id))?.id)
          .filter((id): id is string => id !== undefined),
      ),
    [sortedGradeLevels, sortedSubjects, curriculumByPair],
  );

  const toGrant = grantableIds.filter((id) => selected.has(id) && !initialIds.has(id));
  const toRevoke = grantableIds.filter((id) => !selected.has(id) && initialIds.has(id));
  const isDirty = toGrant.length > 0 || toRevoke.length > 0;

  function toggle(curriculumId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(curriculumId)) {
        next.delete(curriculumId);
      } else {
        next.add(curriculumId);
      }
      return next;
    });
  }

  function setMany(ids: string[], checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (checked) {
          next.add(id);
        } else {
          next.delete(id);
        }
      }
      return next;
    });
  }

  function idsFor(gradeLevelId?: string, subjectId?: string): string[] {
    return grantableIds.filter((id) => {
      const curriculum = curricula.find((candidate) => candidate.id === id);
      if (!curriculum) return false;
      if (gradeLevelId && curriculum.gradeLevelId !== gradeLevelId) return false;
      if (subjectId && curriculum.subjectId !== subjectId) return false;
      return true;
    });
  }

  const allSelectedCount = grantableIds.filter((id) => selected.has(id)).length;
  const allChecked = grantableIds.length > 0 && allSelectedCount === grantableIds.length;

  function reset() {
    setSelected(new Set(initialIds));
    setError(null);
  }

  async function save() {
    // Revoking narrows what every teacher and student in the school can watch, so the
    // count is named in the prompt rather than saving silently.
    if (toRevoke.length > 0) {
      const confirmed = window.confirm(
        `Revoke ${toRevoke.length} entitlement${toRevoke.length === 1 ? '' : 's'}? Teachers and students lose that content immediately.`,
      );
      if (!confirmed) {
        return;
      }
    }

    setError(null);
    setIsSaving(true);

    const response = await fetch(`/api/schools/${schoolId}/entitlements`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        curriculumIds: grantableIds.filter((id) => selected.has(id)),
        audience,
      }),
    });

    setIsSaving(false);

    if (!response.ok) {
      // The API's 409 text ("subject is retired") is the most useful thing to show, so it
      // is surfaced unchanged rather than flattened.
      const body = await response.json().catch(() => ({ message: 'Failed to update entitlements' }));
      setError(body.message ?? 'Failed to update entitlements');
      return;
    }

    router.refresh();
  }

  if (sortedGradeLevels.length === 0 || sortedSubjects.length === 0) {
    return (
      <EmptyState
        icon={<span className="text-3xl">🔒</span>}
        title="No taxonomy to grant yet"
        description="Add grade levels and subjects under Taxonomy before granting a school access to content."
      />
    );
  }

  if (curricula.length === 0) {
    return (
      <EmptyState
        icon={<span className="text-3xl">📚</span>}
        title="No curricula authored yet"
        description="A curriculum is what a school is granted. Create one under Curriculum before granting access."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-card border border-surface-border bg-white shadow-card">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="border-b border-surface-border bg-slate-50/70 text-xs uppercase tracking-wider text-ink-muted">
            <tr>
              <th scope="col" className="sticky left-0 bg-slate-50 px-4 py-3 font-semibold">
                <label className="flex items-center gap-2">
                  <GridCheckbox
                    checked={allChecked}
                    indeterminate={allSelectedCount > 0 && !allChecked}
                    onChange={(checked) => setMany(grantableIds, checked)}
                    ariaLabel="All curricula"
                  />
                  Grade level
                </label>
              </th>
              {sortedSubjects.map((subject) => (
                <th key={subject.id} scope="col" className="px-4 py-3 text-center font-semibold">
                  {subject.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedGradeLevels.map((gradeLevel) => {
              const rowIds = idsFor(gradeLevel.id);
              const rowSelectedCount = rowIds.filter((id) => selected.has(id)).length;
              const rowChecked = rowIds.length > 0 && rowSelectedCount === rowIds.length;

              return (
                <tr key={gradeLevel.id} className="h-12 border-b border-surface-border/70 last:border-0 hover:bg-brand-tint/40">
                  <th scope="row" className="sticky left-0 bg-white px-4 py-3 text-left font-medium">
                    <label className="flex items-center gap-2">
                      <GridCheckbox
                        checked={rowChecked}
                        indeterminate={rowSelectedCount > 0 && !rowChecked}
                        disabled={rowIds.length === 0}
                        onChange={(checked) => setMany(rowIds, checked)}
                        ariaLabel={`All curricula for ${gradeLevel.name}`}
                      />
                      {gradeLevel.name}
                    </label>
                  </th>
                  {sortedSubjects.map((subject) => {
                    const curriculum = curriculumByPair.get(pairKey(gradeLevel.id, subject.id));

                    if (!curriculum) {
                      return (
                        <td key={subject.id} className="px-4 py-3 text-center">
                          <span
                            className="text-xs text-slate-300"
                            title="No curriculum authored for this grade level and subject"
                          >
                            —
                          </span>
                        </td>
                      );
                    }

                    return (
                      <td key={subject.id} className="px-4 py-3 text-center">
                        <span className="inline-flex flex-col items-center gap-0.5">
                          <GridCheckbox
                            checked={selected.has(curriculum.id)}
                            onChange={() => toggle(curriculum.id)}
                            ariaLabel={`${gradeLevel.name} · ${subject.name}`}
                          />
                          {/* A granted draft reaches nobody until it is published, so the
                              state has to be visible here rather than only in the builder. */}
                          {curriculum.status === 'DRAFT' && (
                            <span className="text-[10px] uppercase tracking-wide text-amber-600">
                              draft
                            </span>
                          )}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
          <tfoot className="border-t border-surface-border bg-slate-50/70 text-ink-muted">
            <tr>
              <th scope="row" className="sticky left-0 bg-white px-4 py-3 text-left font-medium">
                All grade levels
              </th>
              {sortedSubjects.map((subject) => {
                const columnIds = idsFor(undefined, subject.id);
                const columnSelectedCount = columnIds.filter((id) => selected.has(id)).length;
                const columnChecked = columnIds.length > 0 && columnSelectedCount === columnIds.length;

                return (
                  <td key={subject.id} className="px-4 py-3 text-center">
                    <GridCheckbox
                      checked={columnChecked}
                      indeterminate={columnSelectedCount > 0 && !columnChecked}
                      disabled={columnIds.length === 0}
                      onChange={(checked) => setMany(columnIds, checked)}
                      ariaLabel={`${subject.name} for all grade levels`}
                    />
                  </td>
                );
              })}
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="text-xs text-ink-muted">
        A dash means no curriculum has been authored for that grade level and subject yet —{' '}
        <Link href="/dashboard/curriculum" className="font-medium text-brand-blue hover:text-brand-navy">
          create one
        </Link>
        .
      </p>

      <div className="sticky bottom-20 flex flex-wrap items-center justify-between gap-3 rounded-card border border-surface-border bg-white px-4 py-3 shadow-overlay md:bottom-4">
        <p className="text-sm text-ink-muted">
          {isDirty ? `${toGrant.length} to grant · ${toRevoke.length} to revoke` : 'No unsaved changes'}
        </p>
        <div className="flex items-center gap-2">
          {error && <p className="max-w-xs text-right text-sm text-status-danger">{error}</p>}
          <button
            type="button"
            onClick={reset}
            disabled={!isDirty || isSaving}
            className="h-10 rounded-lg px-4 text-sm font-medium text-ink-muted hover:bg-brand-tint disabled:opacity-50"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!isDirty || isSaving}
            className="h-10 rounded-lg bg-brand-blue px-4 text-sm font-medium text-white hover:bg-brand-navy disabled:opacity-50"
          >
            {isSaving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
