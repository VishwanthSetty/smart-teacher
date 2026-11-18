'use client';

import { ChangeEvent, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileSpreadsheet } from 'lucide-react';
import type { CalendarImportResult } from '@smart-teacher/shared-types';
import type { CalendarKind } from '@/lib/api-client';
import { Button, buttonClassName } from '@/components/ui/button';
import { dayLabel } from '../../_components/calendar-dates';

const PREVIEW_LIMIT = 8;

// Upload → preview → import. The same file is sent twice, first with dryRun so nothing
// is written; the API refuses a commit while any row is invalid, so the import button
// only appears once the preview is clean.
export function CalendarImport({ kind, calendarId }: { kind: CalendarKind; calendarId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [preview, setPreview] = useState<CalendarImportResult | null>(null);
  const [done, setDone] = useState<CalendarImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send(selected: File, dryRun: boolean, replace: boolean): Promise<CalendarImportResult | null> {
    const form = new FormData();
    form.append('file', selected);
    form.append('dryRun', String(dryRun));
    form.append('replaceExisting', String(replace));
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/calendars/${kind}/${calendarId}/entries/import`, { method: 'POST', body: form });
    setBusy(false);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(response.status === 413 ? 'The file is larger than 5 MB.' : body.message ?? 'Upload failed');
      return null;
    }
    return response.json();
  }

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setFile(selected);
    setPreview(null);
    setDone(null);
    if (selected) {
      setPreview(await send(selected, true, replaceExisting));
    }
  }

  async function onReplaceChange(next: boolean) {
    setReplaceExisting(next);
    if (file) {
      setPreview(await send(file, true, next));
    }
  }

  async function commit() {
    if (!file) return;
    if (replaceExisting && preview && preview.deletedCount > 0 &&
      !window.confirm(`Replace all ${preview.deletedCount} existing lessons with the ${preview.rows.length} in this file?`)) {
      return;
    }
    const result = await send(file, false, replaceExisting);
    if (result) {
      setDone(result);
      setPreview(null);
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
      router.refresh();
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <a href={`/api/calendars/${kind}/${calendarId}/entries/import-template`} className={buttonClassName('secondary')}>
          <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
          Download template
        </a>
        <label className={buttonClassName('primary', 'cursor-pointer')}>
          {busy ? 'Reading…' : file ? 'Choose another file' : 'Choose Excel file'}
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            className="sr-only"
            disabled={busy}
            onChange={onFile}
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={replaceExisting}
            disabled={busy}
            onChange={(event) => onReplaceChange(event.target.checked)}
          />
          Replace existing lessons
        </label>
      </div>
      <p className="text-xs text-ink-muted">
        Columns: Date, Lesson, Notes (optional). Dates as Excel dates, YYYY-MM-DD or DD/MM/YYYY. Up to 2000 rows, 5 MB.
      </p>

      {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-status-danger">{error}</p> : null}

      {done ? (
        <p role="status" className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
          Imported {done.createdCount} lesson{done.createdCount === 1 ? '' : 's'}
          {done.deletedCount > 0 ? `, replacing ${done.deletedCount}` : ''}
          {done.duplicateCount > 0 ? `; ${done.duplicateCount} already in the calendar were skipped` : ''}.
        </p>
      ) : null}

      {preview && file ? (
        <div className="grid gap-3 rounded-lg border border-surface-border p-4">
          <p className="text-sm text-ink">
            <span className="font-semibold">{file.name}</span>: {preview.totalRows} row{preview.totalRows === 1 ? '' : 's'} ·{' '}
            <span className="text-green-700">{preview.rows.length} to add</span>
            {preview.duplicateCount > 0 ? ` · ${preview.duplicateCount} already in the calendar` : ''}
            {preview.errors.length > 0 ? <span className="text-status-danger"> · {preview.errors.length} with problems</span> : null}
            {preview.replaceExisting && preview.deletedCount > 0 ? ` · ${preview.deletedCount} existing will be removed` : ''}
          </p>

          {preview.errors.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[32rem] text-left text-sm">
                <thead className="text-ink-muted">
                  <tr>
                    <th className="py-1 pr-3 font-medium">Row</th>
                    <th className="py-1 pr-3 font-medium">Date</th>
                    <th className="py-1 pr-3 font-medium">Lesson</th>
                    <th className="py-1 font-medium">Problem</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.errors.map((row) => (
                    <tr key={row.rowNumber} className="border-t border-surface-border align-top">
                      <td className="py-1.5 pr-3">{row.rowNumber}</td>
                      <td className="py-1.5 pr-3">{row.date || '—'}</td>
                      <td className="py-1.5 pr-3">{row.title || '—'}</td>
                      <td className="py-1.5 text-status-danger">{row.errors.join('; ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <ul className="grid gap-1 text-sm text-ink-muted">
              {preview.rows.slice(0, PREVIEW_LIMIT).map((row) => (
                <li key={row.rowNumber}>
                  <span className="font-medium text-ink">{dayLabel(row.date)}</span> — {row.title}
                </li>
              ))}
              {preview.rows.length > PREVIEW_LIMIT ? <li>…and {preview.rows.length - PREVIEW_LIMIT} more</li> : null}
            </ul>
          )}

          {preview.errors.length > 0 ? (
            <p className="text-sm text-ink-muted">Fix these rows in the file and choose it again. Nothing has been imported.</p>
          ) : (
            <div>
              <Button disabled={busy || (preview.rows.length === 0 && !preview.replaceExisting)} onClick={commit}>
                {preview.rows.length === 0 ? 'Nothing new to import' : `Import ${preview.rows.length} lesson${preview.rows.length === 1 ? '' : 's'}`}
              </Button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
