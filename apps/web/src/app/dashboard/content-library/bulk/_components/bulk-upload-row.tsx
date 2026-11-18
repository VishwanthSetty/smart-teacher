'use client';

import { memo } from 'react';
import Link from 'next/link';
import { FileText, RotateCcw, Video, X } from 'lucide-react';
import { BulkContentKind } from '@smart-teacher/shared-types';
import { Badge } from '@/components/ui/badge';
import { UploadProgressBar } from '../../_components/upload-progress-bar';
import { formatFileSize } from './bulk-upload-files';
import type { BulkRow } from './use-bulk-upload-queue';

const LIBRARY_ROUTE = '/dashboard/content-library';

interface BulkUploadRowProps {
  row: BulkRow;
  isRunning: boolean;
  isSelected: boolean;
  onToggle: (key: string) => void;
  onTitleChange: (key: string, title: string) => void;
  onRetry: (key: string) => void;
  onRemove: (key: string) => void;
}

function detailHref(row: BulkRow): string {
  return row.kind === BulkContentKind.VIDEO
    ? `${LIBRARY_ROUTE}/${row.recordId}`
    : `${LIBRARY_ROUTE}/documents/${row.recordId}`;
}

function RowStatus({ row }: { row: BulkRow }) {
  switch (row.status) {
    case 'pending':
      return row.destination ? (
        <Badge>Waiting</Badge>
      ) : (
        <Badge variant="warning">Needs a destination</Badge>
      );
    case 'preparing':
      return <Badge variant="info">Preparing</Badge>;
    case 'uploading':
      return <UploadProgressBar percent={row.percent} label="Uploading" />;
    case 'confirming':
      return <Badge variant="info">Verifying</Badge>;
    case 'done':
      return row.kind === BulkContentKind.VIDEO ? (
        <Badge variant="success">Queued for processing</Badge>
      ) : (
        <Badge variant="success">Ready</Badge>
      );
    case 'failed':
      return <Badge variant="danger">Failed</Badge>;
  }
}

// Memoised because a progress tick replaces one row object, and a long queue should not
// re-render every title input for it.
export const BulkUploadRow = memo(function BulkUploadRow({
  row,
  isRunning,
  isSelected,
  onToggle,
  onTitleChange,
  onRetry,
  onRemove,
}: BulkUploadRowProps) {
  // Once a record exists its title and destination are stored, and this list stops being
  // the place to change them.
  const isEditable = !isRunning && row.recordId === null;
  const Icon = row.kind === BulkContentKind.VIDEO ? Video : FileText;

  return (
    <tr className="border-b border-surface-border align-top last:border-0">
      <td className="px-4 py-3">
        <input
          type="checkbox"
          checked={isSelected}
          disabled={!isEditable}
          onChange={() => onToggle(row.key)}
          aria-label={`Select ${row.file.name}`}
          className="mt-3 h-4 w-4 disabled:opacity-40"
        />
      </td>
      <td className="min-w-64 px-4 py-3">
        {row.status === 'done' && row.recordId ? (
          <Link href={detailHref(row)} className="block py-2 font-medium hover:text-brand-blue">
            {row.title}
          </Link>
        ) : isEditable ? (
          <input
            value={row.title}
            maxLength={200}
            onChange={(event) => onTitleChange(row.key, event.target.value)}
            aria-label={`Title for ${row.file.name}`}
            className="field w-full font-normal"
          />
        ) : (
          <p className="py-2 font-medium">{row.title}</p>
        )}
        <p className="mt-1 flex items-center gap-1 break-all text-xs text-ink-muted">
          <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {row.file.name} · {formatFileSize(row.file.size)}
        </p>
        {row.error && <p className="mt-1 text-xs text-status-danger">{row.error}</p>}
      </td>
      <td className="min-w-48 px-4 py-3 text-ink-muted">
        <span className="block py-2">{row.destination?.label ?? 'Not chosen yet'}</span>
      </td>
      <td className="w-56 min-w-48 px-4 py-3">
        <div className="py-2">
          <RowStatus row={row} />
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex justify-end gap-1 py-1">
          {row.status === 'failed' && (
            <button
              type="button"
              disabled={isRunning}
              onClick={() => onRetry(row.key)}
              aria-label={`Retry ${row.file.name}`}
              className="rounded-lg p-2 text-brand-blue hover:bg-brand-tint disabled:opacity-40"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
          {row.status !== 'done' && (
            <button
              type="button"
              disabled={isRunning}
              onClick={() => onRemove(row.key)}
              aria-label={`Remove ${row.file.name}`}
              className="rounded-lg p-2 text-ink-muted hover:bg-brand-tint disabled:opacity-40"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
});
