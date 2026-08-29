import clsx from 'clsx';
import type { HTMLAttributes, TableHTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react';

export function TableShell({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={clsx('overflow-x-auto rounded-card border border-surface-border bg-white shadow-card', className)} {...props} />
  );
}

export function Table({ className, ...props }: TableHTMLAttributes<HTMLTableElement>) {
  return <table className={clsx('w-full min-w-[680px] border-collapse text-left text-sm', className)} {...props} />;
}

export function TableHead({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={clsx('border-b border-surface-border bg-slate-50/70', className)} {...props} />;
}

export function TableHeaderCell({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={clsx('px-5 py-3 text-xs font-semibold uppercase tracking-wider text-ink-muted', className)} {...props} />;
}

export function TableRow({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={clsx('h-12 border-b border-surface-border/70 transition last:border-0 hover:bg-brand-tint/60', className)} {...props} />;
}

export function TableCell({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={clsx('px-5 py-3 text-sm text-ink', className)} {...props} />;
}
