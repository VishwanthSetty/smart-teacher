'use client';

import { AlertTriangle, Info, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from './button';

export function ConfirmationDialog({
  isOpen,
  title,
  description,
  confirmLabel,
  isDestructive = false,
  isSubmitting = false,
  onCancel,
  onConfirm,
  children,
}: {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  isDestructive?: boolean;
  isSubmitting?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  children?: ReactNode;
}) {
  if (!isOpen) return null;
  const Icon = isDestructive ? AlertTriangle : Info;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4" role="presentation">
      <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-description" className="w-full max-w-md rounded-card border border-surface-border bg-white p-6 shadow-overlay">
        <div className="flex items-start justify-between gap-4">
          <span className={`flex h-12 w-12 items-center justify-center rounded-full ${isDestructive ? 'bg-red-100 text-status-danger' : 'bg-brand-tint text-brand-blue'}`}>
            <Icon className="h-6 w-6" aria-hidden="true" />
          </span>
          <button type="button" onClick={onCancel} className="rounded-md p-1.5 text-ink-muted hover:bg-slate-100" aria-label="Close dialog"><X className="h-4 w-4" /></button>
        </div>
        <h2 id="confirm-title" className="mt-4 text-lg font-semibold text-ink">{title}</h2>
        <p id="confirm-description" className="mt-2 text-sm leading-6 text-ink-muted">{description}</p>
        {children}
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button variant={isDestructive ? 'danger' : 'primary'} disabled={isSubmitting} onClick={onConfirm}>
            {isSubmitting ? 'Working…' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
