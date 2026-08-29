'use client';

import { X } from 'lucide-react';
import type { ReactNode } from 'react';

export function Drawer({
  isOpen,
  title,
  children,
  onClose,
  placement = 'right',
}: {
  isOpen: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  placement?: 'right' | 'bottom';
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={title}>
      <button className="absolute inset-0 bg-slate-950/30" onClick={onClose} aria-label="Close drawer" />
      <div className={placement === 'bottom' ? 'absolute inset-x-0 bottom-0 flex max-h-[85vh] flex-col rounded-t-2xl bg-white shadow-overlay' : 'absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-white shadow-overlay'}>
        <div className="flex h-16 items-center justify-between border-b border-surface-border px-6">
          <h2 className="text-lg font-medium text-ink">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-2 text-ink-muted hover:bg-brand-tint" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">{children}</div>
      </div>
    </div>
  );
}
