'use client';

import { type ChangeEvent, type DragEvent, useCallback, useMemo, useState } from 'react';
import { UploadCloud } from 'lucide-react';
import type { Curriculum } from '@smart-teacher/shared-types';
import { Button } from '@/components/ui/button';
import { ContentNodePicker } from '@/components/content/content-node-picker';
import { UploadProgressBar } from '../../_components/upload-progress-bar';
import { ACCEPTED_FILE_INPUT } from './bulk-upload-files';
import { BulkUploadRow } from './bulk-upload-row';
import {
  canStart,
  useBulkUploadQueue,
  type BulkDestination,
  type SkippedFile,
} from './use-bulk-upload-queue';

function destinationLabel(curriculum: Curriculum | undefined, nodeTitle: string): string {
  if (!curriculum) return nodeTitle;
  const audience = curriculum.audience === 'TEACHER' ? 'Teachers' : 'Students';
  return `${audience} · ${curriculum.gradeLevelName} · ${curriculum.subjectName} › ${nodeTitle}`;
}

export function BulkUploadWorkspace({ curricula }: { curricula: Curriculum[] }) {
  const queue = useBulkUploadQueue();
  const { rows, isRunning, addFiles, setTitle, retry, remove } = queue;
  const [destination, setDestination] = useState<BulkDestination | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [skipped, setSkipped] = useState<SkippedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const selectableKeys = useMemo(
    () => rows.filter((row) => row.recordId === null).map((row) => row.key),
    [rows],
  );
  // A row that gained a record since being ticked can no longer be re-filed.
  const selectedKeys = selectableKeys.filter((key) => selected.has(key));
  const readyCount = rows.filter(canStart).length;
  const failedKeys = rows.filter((row) => row.status === 'failed').map((row) => row.key);
  const doneCount = rows.filter((row) => row.status === 'done').length;
  const unfiledCount = rows.filter((row) => row.status === 'pending' && !row.destination).length;
  const untitledCount = rows.filter((row) => row.status === 'pending' && !row.title.trim()).length;
  const hasStarted = rows.some((row) => row.status !== 'pending');

  // Weighted by size, so a 2 GB video moves the bar more than a 1 MB worksheet does.
  const overallPercent = useMemo(() => {
    const totalBytes = rows.reduce((sum, row) => sum + row.file.size, 0);
    if (totalBytes === 0) return 0;
    const sentBytes = rows.reduce((sum, row) => sum + (row.file.size * row.percent) / 100, 0);
    return Math.round((sentBytes / totalBytes) * 100);
  }, [rows]);

  function add(files: File[]) {
    setSkipped(addFiles(files, destination));
  }

  function handleInput(event: ChangeEvent<HTMLInputElement>) {
    add(Array.from(event.target.files ?? []));
    // Without this, choosing the same file again after removing it fires no change event.
    event.target.value = '';
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    add(Array.from(event.dataTransfer.files));
  }

  function toggleAll() {
    setSelected(selectedKeys.length === selectableKeys.length ? new Set() : new Set(selectableKeys));
  }

  function applyDestination() {
    if (!destination) return;
    queue.setDestination(selectedKeys, destination);
    setSelected(new Set());
  }

  const toggle = useCallback((key: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }, []);
  const handleRetry = useCallback((key: string) => retry([key]), [retry]);
  const handleRemove = useCallback((key: string) => void remove(key), [remove]);

  return (
    <div className="flex flex-col gap-6">
      <section
        aria-labelledby="bulk-destination-heading"
        className="grid gap-4 rounded-card border border-surface-border bg-white p-6 shadow-card"
      >
        <div>
          <h2 id="bulk-destination-heading" className="text-base font-semibold text-ink">
            Where should these files go?
          </h2>
          <p className="text-sm text-ink-muted">
            Files you add are filed here. To fill several topics, change this and add the next set,
            or tick files below and apply a new destination.
          </p>
        </div>
        <ContentNodePicker
          curricula={curricula}
          required={false}
          onChange={({ curriculumId, contentNodeId, contentNodeTitle }) =>
            setDestination(
              contentNodeId
                ? {
                    contentNodeId,
                    label: destinationLabel(
                      curricula.find((curriculum) => curriculum.id === curriculumId),
                      contentNodeTitle,
                    ),
                  }
                : null,
            )
          }
        />
        <label
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center transition focus-within:ring-2 focus-within:ring-brand-blue ${
            isDragging ? 'border-brand-blue bg-brand-tint' : 'border-brand-soft bg-brand-tint/30 hover:bg-brand-tint/60'
          }`}
        >
          <UploadCloud className="h-8 w-8 text-brand-blue" aria-hidden="true" />
          <span className="text-sm font-medium text-ink">Drop files here, or click to choose</span>
          <span className="text-xs text-ink-muted">
            MP4 or MOV videos up to 2 GB, and PDFs up to 50 MB
          </span>
          <input
            type="file"
            multiple
            accept={ACCEPTED_FILE_INPUT}
            onChange={handleInput}
            className="sr-only"
          />
        </label>
        {skipped.length > 0 && (
          <div role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-medium">
              {skipped.length} {skipped.length === 1 ? 'file was' : 'files were'} not added
            </p>
            <ul className="mt-1 list-inside list-disc break-all">
              {skipped.map((file) => (
                <li key={`${file.name}:${file.reason}`}>
                  {file.name}: {file.reason}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {rows.length > 0 && (
        <section aria-label="Upload queue" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            {isRunning ? (
              <Button variant="danger" onClick={queue.cancel}>
                Cancel uploads
              </Button>
            ) : (
              <Button disabled={readyCount === 0} onClick={queue.start}>
                Upload {readyCount} {readyCount === 1 ? 'file' : 'files'}
              </Button>
            )}
            {failedKeys.length > 0 && (
              <Button variant="secondary" disabled={isRunning} onClick={() => retry(failedKeys)}>
                Retry {failedKeys.length} failed
              </Button>
            )}
            <Button
              variant="secondary"
              disabled={isRunning || !destination || selectedKeys.length === 0}
              onClick={applyDestination}
            >
              Apply destination to {selectedKeys.length} selected
            </Button>
            {doneCount > 0 && (
              <Button variant="ghost" disabled={isRunning} onClick={queue.clearFinished}>
                Clear {doneCount} finished
              </Button>
            )}
          </div>

          {(unfiledCount > 0 || untitledCount > 0) && (
            <p className="text-sm text-amber-700">
              {[
                unfiledCount > 0 &&
                  `${unfiledCount} ${unfiledCount === 1 ? 'file needs' : 'files need'} a destination`,
                untitledCount > 0 &&
                  `${untitledCount} ${untitledCount === 1 ? 'file needs' : 'files need'} a title`,
              ]
                .filter(Boolean)
                .join(' and ')}
              , and won&apos;t upload until then.
            </p>
          )}

          {hasStarted && (
            <div className="rounded-card border border-surface-border bg-white p-4 shadow-card">
              <UploadProgressBar
                percent={overallPercent}
                label={`${doneCount} of ${rows.length} finished${failedKeys.length > 0 ? `, ${failedKeys.length} failed` : ''}`}
              />
            </div>
          )}

          <div className="overflow-x-auto rounded-card border border-surface-border bg-white shadow-card">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-surface-border bg-slate-50/70 text-xs uppercase tracking-wider text-ink-muted">
                <tr>
                  <th className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectableKeys.length > 0 && selectedKeys.length === selectableKeys.length}
                      disabled={isRunning || selectableKeys.length === 0}
                      onChange={toggleAll}
                      aria-label="Select all files"
                      className="h-4 w-4 disabled:opacity-40"
                    />
                  </th>
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3">Filed under</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <BulkUploadRow
                    key={row.key}
                    row={row}
                    isRunning={isRunning}
                    isSelected={selected.has(row.key)}
                    onToggle={toggle}
                    onTitleChange={setTitle}
                    onRetry={handleRetry}
                    onRemove={handleRemove}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
