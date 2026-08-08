'use client';

import type { CurriculumLevel } from '@smart-teacher/shared-types';

export type EditableLevel = Omit<CurriculumLevel, 'id'>;

export function LevelListEditor({ levels, onChange }: { levels: EditableLevel[]; onChange: (levels: EditableLevel[]) => void }) {
  function replace(index: number, patch: Partial<EditableLevel>) {
    onChange(levels.map((level, position) => position === index ? { ...level, ...patch } : level));
  }
  return (
    <div className="grid gap-2">
      {levels.map((level, index) => (
        <div key={level.depth} className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-2">
          <span className="w-8 text-center text-sm text-gray-500">{index + 1}</span>
          <input aria-label={`Level ${index + 1} name`} required value={level.name} onChange={(event) => replace(index, { name: event.target.value })} placeholder={index === 0 ? 'Chapter' : 'Topic'} className="rounded border px-3 py-2 text-sm" />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={level.canHoldContent} onChange={(event) => replace(index, { canHoldContent: event.target.checked })} /> Holds videos</label>
          <button type="button" disabled={levels.length === 1} onClick={() => onChange(levels.filter((_, position) => position !== index).map((item, position) => ({ ...item, depth: position + 1 })))} className="rounded px-2 py-1 text-sm text-red-700 disabled:opacity-30">Remove</button>
        </div>
      ))}
      <button type="button" disabled={levels.length >= 10} onClick={() => onChange([...levels, { depth: levels.length + 1, name: '', canHoldContent: false }])} className="w-fit rounded border px-3 py-1.5 text-sm disabled:opacity-50">Add level</button>
    </div>
  );
}
