'use client';

import type { CurriculumLevel } from '@smart-teacher/shared-types';

export type EditableLevel = Omit<CurriculumLevel, 'id'>;

export function LevelListEditor({ levels, onChange }: { levels: EditableLevel[]; onChange: (levels: EditableLevel[]) => void }) {
  function replace(index: number, patch: Partial<EditableLevel>) {
    onChange(levels.map((level, position) => position === index ? { ...level, ...patch } : level));
  }
  return (
    <div className="grid gap-2 rounded-xl border border-surface-border bg-surface-canvas p-3">
      {levels.map((level, index) => (
        <div key={level.depth} className="grid gap-2 rounded-lg border border-surface-border bg-white p-3 sm:grid-cols-[auto_1fr_auto_auto] sm:items-center">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-tint text-xs font-semibold text-brand-navy">{index + 1}</span>
          <input aria-label={`Level ${index + 1} name`} required value={level.name} onChange={(event) => replace(index, { name: event.target.value })} placeholder={index === 0 ? 'Chapter' : 'Topic'} className="field" />
          <label className="flex items-center gap-2 text-sm text-ink-muted"><input className="h-4 w-4 rounded border-surface-border text-brand-blue focus:ring-brand-blue" type="checkbox" checked={level.canHoldContent} onChange={(event) => replace(index, { canHoldContent: event.target.checked })} /> Holds content</label>
          <button type="button" disabled={levels.length === 1} onClick={() => onChange(levels.filter((_, position) => position !== index).map((item, position) => ({ ...item, depth: position + 1 })))} className="rounded-lg px-2 py-1 text-sm font-medium text-status-danger hover:bg-red-50 disabled:opacity-30">Remove</button>
        </div>
      ))}
      <button type="button" disabled={levels.length >= 10} onClick={() => onChange([...levels, { depth: levels.length + 1, name: '', canHoldContent: false }])} className="w-fit rounded-lg border border-dashed border-brand-blue px-3 py-2 text-sm font-medium text-brand-blue hover:bg-brand-tint disabled:opacity-50">+ Add level</button>
    </div>
  );
}
